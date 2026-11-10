// @generated automatically by Diesel CLI.

diesel::table! {
    documents (id) {
        id -> Integer,
        folder_id -> Nullable<Integer>,
        name -> Text,
        kind -> Text,
        thumbnail -> Nullable<Binary>,
        pinned -> Bool,
        created_at -> BigInt,
        updated_at -> BigInt,
        opened_at -> Nullable<BigInt>,
        trashed_at -> Nullable<BigInt>,
    }
}

diesel::table! {
    drafts (document_id) {
        document_id -> Integer,
        base_version_id -> Integer,
        content -> Text,
        updated_at -> BigInt,
    }
}

diesel::table! {
    folders (id) {
        id -> Integer,
        parent_id -> Nullable<Integer>,
        name -> Text,
        created_at -> BigInt,
    }
}

diesel::table! {
    palettes (id) {
        id -> Integer,
        name -> Text,
        colors -> Text,
        created_at -> BigInt,
    }
}

diesel::table! {
    prefs (key) {
        key -> Text,
        value -> Text,
    }
}

diesel::table! {
    versions (id) {
        id -> Integer,
        document_id -> Integer,
        content -> Text,
        bytes -> BigInt,
        created_at -> BigInt,
    }
}

diesel::joinable!(documents -> folders (folder_id));
diesel::joinable!(drafts -> documents (document_id));
diesel::joinable!(versions -> documents (document_id));

diesel::allow_tables_to_appear_in_same_query!(
    documents, drafts, folders, palettes, prefs, versions,
);
