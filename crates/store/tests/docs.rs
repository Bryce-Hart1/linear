use linear_store::docs::{self, NewDoc, Query, Saved, View};
use linear_store::prefs::LibrarySort;
use linear_store::{Error, Kind, Store, folders};
use serde_json::json;

const BLANK: &str = "{\"lin\":1,\"w\":1200,\"h\":800,\"next\":1,\"items\":[]}\n";

fn new(name: &str, kind: Kind, folder: Option<i32>) -> NewDoc {
    NewDoc { name: name.into(), kind, folder, content: BLANK.into(), thumbnail: None }
}

fn names(list: &[docs::DocMeta]) -> Vec<&str> {
    list.iter().map(|d| d.name.as_str()).collect()
}

fn invalid<T: std::fmt::Debug>(r: linear_store::Result<T>) -> String {
    match r {
        Err(Error::Invalid(m)) => m,
        other => panic!("expected a refusal, got {other:?}"),
    }
}

#[test]
fn create_open_and_save() {
    let s = Store::memory().unwrap();
    let d = s.with(|c| docs::create(c, &new("Plan.lin", Kind::Lin, None))).unwrap();
    assert_eq!(d.name, "Plan", "the kind's own extension is dropped");
    assert_eq!(d.kind, Kind::Lin);

    let o = s.with(|c| docs::open(c, d.id)).unwrap();
    assert_eq!(o.content, BLANK);
    assert!(o.meta.opened_at.is_some());
    assert!(o.draft.is_none());

    assert_eq!(s.with(|c| docs::save(c, d.id, BLANK, None)).unwrap(), Saved::Unchanged);

    let edited = BLANK.replace("\"next\":1", "\"next\":2");
    let Saved::Saved { version, meta } = s.with(|c| docs::save(c, d.id, &edited, Some(vec![1, 2, 3]))).unwrap() else {
        panic!("should have saved");
    };
    assert_eq!(version.bytes, edited.len() as i64);
    assert!(meta.has_thumbnail);
    assert_eq!(s.with(|c| docs::thumbnail(c, d.id)).unwrap(), Some(vec![1, 2, 3]));
    assert_eq!(s.with(|c| docs::open(c, d.id)).unwrap().content, edited);
    assert_eq!(s.with(|c| docs::list_versions(c, d.id)).unwrap().len(), 2);
}

#[test]
fn names_are_cleaned_and_kept_unique_in_a_folder() {
    let s = Store::memory().unwrap();
    for bad in ["", "   ", "a/b", "a:b", "tab\there", &"x".repeat(121)] {
        invalid(s.with(|c| docs::create(c, &new(bad, Kind::Lin, None))));
    }
    let a = s.with(|c| docs::create(c, &new("Plan", Kind::Lin, None))).unwrap();
    let b = s.with(|c| docs::create(c, &new("plan", Kind::Lpx, None))).unwrap();
    let c3 = s.with(|c| docs::create(c, &new("Plan", Kind::Ldw, None))).unwrap();
    assert_eq!((a.name.as_str(), b.name.as_str(), c3.name.as_str()), ("Plan", "plan 2", "Plan 3"));

    // Another folder is another namespace.
    let f = s.with(|c| folders::create(c, None, "Work")).unwrap();
    let d = s.with(|c| docs::create(c, &new("Plan", Kind::Lin, Some(f.id)))).unwrap();
    assert_eq!(d.name, "Plan");

    // Renaming to a taken name is refused; to its own name in another case, allowed.
    assert!(invalid(s.with(|c| docs::rename(c, b.id, "PLAN"))).contains("already"));
    assert_eq!(s.with(|c| docs::rename(c, a.id, "PLAN")).unwrap().name, "PLAN");

    // Duplicates and moves take the next free name.
    assert_eq!(s.with(|c| docs::duplicate(c, d.id)).unwrap().name, "Plan copy");
    assert_eq!(s.with(|c| docs::duplicate(c, d.id)).unwrap().name, "Plan copy 2");
    assert_eq!(s.with(|c| docs::move_to(c, d.id, None)).unwrap().name, "Plan 4");
}

#[test]
fn listing_by_view_kind_search_and_sort() {
    let s = Store::memory().unwrap();
    let f = s.with(|c| folders::create(c, None, "Work")).unwrap();
    let a = s.with(|c| docs::create(c, &new("banana", Kind::Lin, None))).unwrap();
    let b = s.with(|c| docs::create(c, &new("Apple", Kind::Lpx, Some(f.id)))).unwrap();
    let c3 = s.with(|c| docs::create(c, &new("cherry_50%", Kind::Ldw, None))).unwrap();
    let list = |q: Query| s.with(|c| docs::list(c, &q)).unwrap();

    assert_eq!(list(Query { sort: Some(LibrarySort::Name), ..Default::default() }).len(), 3);
    assert_eq!(names(&list(Query { sort: Some(LibrarySort::Name), ..Default::default() })), ["Apple", "banana", "cherry_50%"]);
    assert_eq!(names(&list(Query { view: View::Folder, folder: Some(f.id), ..Default::default() })), ["Apple"]);
    assert_eq!(list(Query { view: View::Folder, folder: None, ..Default::default() }).len(), 2);
    assert_eq!(names(&list(Query { kind: Some(Kind::Ldw), ..Default::default() })), ["cherry_50%"]);
    assert_eq!(names(&list(Query { search: Some("AN".into()), ..Default::default() })), ["banana"]);
    // % and _ are letters to search for, not wildcards.
    assert_eq!(names(&list(Query { search: Some("_50%".into()), ..Default::default() })), ["cherry_50%"]);
    assert!(list(Query { search: Some("y5".into()), ..Default::default() }).is_empty());

    assert!(list(Query { view: View::Recent, ..Default::default() }).is_empty());
    s.with(|c| docs::open(c, a.id)).unwrap();
    assert_eq!(names(&list(Query { view: View::Recent, ..Default::default() })), ["banana"]);

    s.with(|c| docs::set_pinned(c, b.id, true)).unwrap();
    assert_eq!(names(&list(Query { view: View::Pinned, ..Default::default() })), ["Apple"]);

    s.with(|c| docs::trash(c, c3.id)).unwrap();
    assert_eq!(names(&list(Query { view: View::Trash, ..Default::default() })), ["cherry_50%"]);
    assert_eq!(list(Query::default()).len(), 2);
}

#[test]
fn trash_restore_and_delete_forever() {
    let s = Store::memory().unwrap();
    let a = s.with(|c| docs::create(c, &new("Plan", Kind::Lin, None))).unwrap();
    s.with(|c| docs::trash(c, a.id)).unwrap();

    // A trashed document can't be saved, and doesn't hold its name.
    assert!(invalid(s.with(|c| docs::save(c, a.id, "x", None))).contains("Trash"));
    let b = s.with(|c| docs::create(c, &new("Plan", Kind::Lin, None))).unwrap();
    assert_eq!(b.name, "Plan");

    // Restoring finds a free name; deleting forever needs it in the Trash first.
    assert_eq!(s.with(|c| docs::restore(c, a.id)).unwrap().name, "Plan 2");
    invalid(s.with(|c| docs::delete_forever(c, a.id)));
    s.with(|c| docs::trash(c, a.id)).unwrap();
    s.with(|c| docs::delete_forever(c, a.id)).unwrap();
    assert!(matches!(s.with(|c| docs::meta(c, a.id)), Err(Error::NotFound(_))));
    assert!(s.with(|c| docs::list_versions(c, a.id)).is_err());

    s.with(|c| docs::trash(c, b.id)).unwrap();
    assert_eq!(s.with(docs::empty_trash).unwrap(), 1);
    assert!(s.with(|c| docs::list(c, &Query::default())).unwrap().is_empty());
}

#[test]
fn versions_are_pruned_and_restored_by_copying() {
    let s = Store::memory().unwrap();
    s.set_pref("versions.keep", json!(3)).unwrap();
    let d = s.with(|c| docs::create(c, &new("Plan", Kind::Lin, None))).unwrap();
    for i in 2..=5 {
        s.with(|c| docs::save(c, d.id, &format!("v{i}"), None)).unwrap();
    }
    let vs = s.with(|c| docs::list_versions(c, d.id)).unwrap();
    let contents: Vec<String> = vs.iter().map(|v| s.with(|c| docs::read_version(c, v.id)).unwrap()).collect();
    assert_eq!(contents, ["v5", "v4", "v3"]);

    // Restoring v3 puts a copy on top and keeps three.
    s.with(|c| docs::restore_version(c, vs[2].id, None)).unwrap();
    let vs = s.with(|c| docs::list_versions(c, d.id)).unwrap();
    let contents: Vec<String> = vs.iter().map(|v| s.with(|c| docs::read_version(c, v.id)).unwrap()).collect();
    assert_eq!(contents, ["v3", "v5", "v4"]);
    assert_eq!(s.with(|c| docs::content(c, d.id)).unwrap(), "v3");
}

#[test]
fn drafts_are_kept_until_saved() {
    let s = Store::memory().unwrap();
    let d = s.with(|c| docs::create(c, &new("Plan", Kind::Lin, None))).unwrap();
    let base = s.with(|c| docs::open(c, d.id)).unwrap().version.id;
    s.with(|c| docs::put_draft(c, d.id, base, "first try")).unwrap();
    s.with(|c| docs::put_draft(c, d.id, base, "second try")).unwrap();
    let draft = s.with(|c| docs::open(c, d.id)).unwrap().draft.unwrap();
    assert_eq!((draft.base_version_id, draft.content.as_str()), (base, "second try"));

    s.with(|c| docs::save(c, d.id, "second try", None)).unwrap();
    assert!(s.with(|c| docs::open(c, d.id)).unwrap().draft.is_none());

    s.with(|c| docs::put_draft(c, d.id, base, "again")).unwrap();
    s.with(|c| docs::discard_draft(c, d.id)).unwrap();
    assert!(s.with(|c| docs::open(c, d.id)).unwrap().draft.is_none());
}

#[test]
fn sizes_are_limited() {
    let s = Store::memory().unwrap();
    let big_lin = "x".repeat(docs::MAX_LIN + 1);
    let mut n = new("Big", Kind::Lin, None);
    n.content = big_lin.clone();
    assert!(invalid(s.with(|c| docs::create(c, &n))).contains("1 MiB"));
    n.kind = Kind::Ldw;
    s.with(|c| docs::create(c, &n)).unwrap();
    let d = s.with(|c| docs::create(c, &new("Thumb", Kind::Lin, None))).unwrap();
    invalid(s.with(|c| docs::save(c, d.id, "x", Some(vec![0; docs::MAX_THUMBNAIL + 1]))));
}

#[test]
fn unknown_ids_are_not_found() {
    let s = Store::memory().unwrap();
    assert!(matches!(s.with(|c| docs::open(c, 99)), Err(Error::NotFound("document"))));
    assert!(matches!(s.with(|c| docs::read_version(c, 99)), Err(Error::NotFound("version"))));
    assert!(matches!(s.with(|c| docs::create(c, &new("x", Kind::Lin, Some(99)))), Err(Error::NotFound("folder"))));
}
