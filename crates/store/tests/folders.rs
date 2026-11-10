use linear_store::docs::{self, NewDoc, Query, View};
use linear_store::{Error, Kind, Store, folders};

fn doc(s: &Store, name: &str, folder: Option<i32>) -> docs::DocMeta {
    s.with(|c| docs::create(c, &NewDoc { name: name.into(), kind: Kind::Lin, folder, content: "x".into(), thumbnail: None }))
        .unwrap()
}

#[test]
fn folder_names_are_unique_among_siblings() {
    let s = Store::memory().unwrap();
    let work = s.with(|c| folders::create(c, None, "Work")).unwrap();
    assert!(matches!(s.with(|c| folders::create(c, None, "work")), Err(Error::Invalid(_))));
    // Same name, different parent: fine.
    let inner = s.with(|c| folders::create(c, Some(work.id), "Work")).unwrap();
    assert_eq!(inner.parent_id, Some(work.id));
    let home = s.with(|c| folders::create(c, None, "Home")).unwrap();
    assert!(matches!(s.with(|c| folders::rename(c, home.id, "WORK")), Err(Error::Invalid(_))));
    assert_eq!(s.with(|c| folders::rename(c, home.id, "House")).unwrap().name, "House");
    let all: Vec<String> = s.with(folders::list).unwrap().into_iter().map(|f| f.name).collect();
    assert_eq!(all, ["House", "Work", "Work"]);
}

#[test]
fn a_folder_cant_move_inside_itself() {
    let s = Store::memory().unwrap();
    let a = s.with(|c| folders::create(c, None, "A")).unwrap();
    let b = s.with(|c| folders::create(c, Some(a.id), "B")).unwrap();
    let c3 = s.with(|c| folders::create(c, Some(b.id), "C")).unwrap();
    for target in [a.id, b.id, c3.id] {
        assert!(matches!(s.with(|c| folders::move_to(c, a.id, Some(target))), Err(Error::Invalid(_))));
    }
    assert_eq!(s.with(|c| folders::move_to(c, c3.id, None)).unwrap().parent_id, None);
}

#[test]
fn deleting_a_folder_keeps_its_documents() {
    let s = Store::memory().unwrap();
    let a = s.with(|c| folders::create(c, None, "A")).unwrap();
    let b = s.with(|c| folders::create(c, Some(a.id), "B")).unwrap();
    doc(&s, "Plan", None);
    let p = doc(&s, "Plan", Some(a.id));
    let q = doc(&s, "Notes", Some(b.id));
    let t = doc(&s, "Old", Some(b.id));
    s.with(|c| docs::trash(c, t.id)).unwrap();

    assert_eq!(s.with(|c| folders::delete(c, a.id)).unwrap(), 3);
    assert!(s.with(folders::list).unwrap().is_empty());

    let top = s.with(|c| docs::list(c, &Query { view: View::Folder, folder: None, ..Default::default() })).unwrap();
    let mut names: Vec<String> = top.into_iter().map(|d| d.name).collect();
    names.sort();
    assert_eq!(names, ["Notes", "Plan", "Plan 2"]);
    assert_eq!(s.with(|c| docs::meta(c, p.id)).unwrap().folder_id, None);
    assert_eq!(s.with(|c| docs::meta(c, q.id)).unwrap().folder_id, None);
    let trashed = s.with(|c| docs::meta(c, t.id)).unwrap();
    assert_eq!((trashed.folder_id, trashed.trashed_at.is_some()), (None, true));
}
