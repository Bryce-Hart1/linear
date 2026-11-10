use diesel::prelude::*;
use linear_store::prefs::{LinMode, Theme};
use linear_store::schema::prefs;
use linear_store::{Error, Prefs, Store};
use serde_json::json;

#[test]
fn a_new_library_has_the_defaults() {
    let store = Store::memory().unwrap();
    assert_eq!(store.prefs().unwrap(), Prefs::default());
}

#[test]
fn a_preference_is_kept_across_opens() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("nested").join("linear.db");
    {
        let store = Store::open(&path).unwrap();
        let p = store.set_pref("theme", json!("dark")).unwrap();
        assert_eq!(p.theme, Theme::Dark);
        store.set_pref("lin.openIn", json!("edit")).unwrap();
    }
    let store = Store::open(&path).unwrap();
    let p = store.prefs().unwrap();
    assert_eq!(p.theme, Theme::Dark);
    assert_eq!(p.lin.open_in, LinMode::Edit);
}

#[test]
fn unknown_keys_wrong_types_and_out_of_range_values_are_refused() {
    let store = Store::memory().unwrap();
    for (key, value) in [
        ("colour", json!("dark")),
        ("theme", json!(3)),
        ("theme", json!("sepia")),
        ("versions.keep", json!(0)),
        ("lpx.defaultSize", json!([0, 32])),
        ("lpx.defaultSize", json!([32])),
        ("ldw.pen.color", json!("red")),
        ("ldw.pen", json!({"color": "#000000", "width": 3})),
        ("window.bounds.x", json!(10)),
        ("bad key", json!(1)),
    ] {
        match store.set_pref(key, value.clone()) {
            Err(Error::Invalid(_)) => {}
            other => panic!("{key} = {value} should be refused, got {other:?}"),
        }
    }
    assert_eq!(store.prefs().unwrap(), Prefs::default(), "nothing refused was stored");
}

#[test]
fn a_group_replaces_the_rows_under_it() {
    let store = Store::memory().unwrap();
    store.set_pref("ldw.pen.color", json!("#ff0000")).unwrap();
    let p = store.set_pref("ldw.pen", json!({"color": "#00ff00", "width": 8, "opacity": 50})).unwrap();
    assert_eq!(p.ldw.pen.color, "#00ff00");
    assert_eq!(p.ldw.pen.width, 8.0);
    let rows: Vec<String> = prefs::table.select(prefs::key).load(&mut store.conn().unwrap()).unwrap();
    assert_eq!(rows, vec!["ldw.pen".to_string()]);

    // …and a child row set afterwards still applies on top.
    let p = store.set_pref("ldw.pen.width", json!(2)).unwrap();
    assert_eq!((p.ldw.pen.color.as_str(), p.ldw.pen.width), ("#00ff00", 2.0));
}

#[test]
fn reset_goes_back_to_the_default() {
    let store = Store::memory().unwrap();
    store.set_pref("ldw.pen.width", json!(10)).unwrap();
    store.set_pref("theme", json!("light")).unwrap();
    let p = store.reset_pref("ldw").unwrap();
    assert_eq!(p.ldw, Prefs::default().ldw);
    assert_eq!(p.theme, Theme::Light);
}

#[test]
fn rows_that_no_longer_fit_are_skipped_not_fatal() {
    let store = Store::memory().unwrap();
    store.set_pref("theme", json!("dark")).unwrap();
    // As if written by another version of linear.
    diesel::insert_into(prefs::table)
        .values(&vec![
            (prefs::key.eq("gone.away"), prefs::value.eq("1")),
            (prefs::key.eq("versions.keep"), prefs::value.eq("-4")),
            (prefs::key.eq("ui.showHints"), prefs::value.eq("not json")),
        ])
        .execute(&mut store.conn().unwrap())
        .unwrap();
    let p = store.prefs().unwrap();
    assert_eq!(p.theme, Theme::Dark);
    assert_eq!(p.versions.keep, Prefs::default().versions.keep);
    assert!(p.ui.show_hints);
}

#[test]
fn window_bounds_can_be_set_and_cleared() {
    let store = Store::memory().unwrap();
    let p = store.set_pref("window.bounds", json!({"x": 10, "y": 20, "w": 1100, "h": 720})).unwrap();
    assert_eq!(p.window.bounds.unwrap().w, 1100.0);
    let p = store.set_pref("window.bounds", json!(null)).unwrap();
    assert!(p.window.bounds.is_none());
}

#[test]
fn the_tables_exist_and_foreign_keys_are_on() {
    let store = Store::memory().unwrap();
    let mut conn = store.conn().unwrap();
    #[derive(QueryableByName)]
    struct Name {
        #[diesel(sql_type = diesel::sql_types::Text)]
        name: String,
    }
    let mut names: Vec<String> = diesel::sql_query(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite%'",
    )
    .load::<Name>(&mut conn)
    .unwrap()
    .into_iter()
    .map(|n| n.name)
    .collect();
    names.sort();
    assert_eq!(names, ["documents", "drafts", "folders", "palettes", "prefs", "versions"]);

    #[derive(QueryableByName)]
    struct On {
        #[diesel(sql_type = diesel::sql_types::Integer)]
        foreign_keys: i32,
    }
    let on = diesel::sql_query("PRAGMA foreign_keys").get_result::<On>(&mut conn).unwrap();
    assert_eq!(on.foreign_keys, 1);
}
