use linear_store::{Error, Store, palettes};

fn strings(v: &[&str]) -> Vec<String> {
    v.iter().map(|s| s.to_string()).collect()
}

#[test]
fn palettes_are_saved_normalised_and_listed_by_name() {
    let s = Store::memory().unwrap();
    let b = s.with(|c| palettes::save(c, "  Sunset ", &strings(&["#F00", "#ff8800", "#ffcc0080"]))).unwrap();
    assert_eq!(b.name, "Sunset");
    assert_eq!(b.colours, ["#ff0000ff", "#ff8800ff", "#ffcc0080"]);
    s.with(|c| palettes::save(c, "Abyss", &strings(&["#000"]))).unwrap();
    let names: Vec<String> = s.with(palettes::list).unwrap().into_iter().map(|p| p.name).collect();
    assert_eq!(names, ["Abyss", "Sunset"]);
    s.with(|c| palettes::delete(c, b.id)).unwrap();
    assert_eq!(s.with(palettes::list).unwrap().len(), 1);
    assert!(matches!(s.with(|c| palettes::delete(c, b.id)), Err(Error::NotFound("palette"))));
}

#[test]
fn bad_palettes_are_refused() {
    let s = Store::memory().unwrap();
    for (name, colours) in [
        ("", strings(&["#000"])),
        ("x", vec![]),
        ("x", strings(&["black"])),
        ("x", strings(&["#12345"])),
        ("x", vec!["#000".to_string(); 256]),
    ] {
        assert!(matches!(s.with(|c| palettes::save(c, name, &colours)), Err(Error::Invalid(_))), "{name} {colours:?}");
    }
}
