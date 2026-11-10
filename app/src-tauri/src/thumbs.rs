// The `thumb://` protocol: the library's <img> tags load each document's
// thumbnail straight from the store, at `thumb://localhost/<id>?v=<updated_at>`
// (`http://thumb.localhost/…` on Windows). `v` changes whenever the document
// is saved, so a cached image is never stale.

use linear_store::Store;
use tauri::http::{Request, Response, StatusCode, header};
use tauri::{Manager, Runtime, UriSchemeContext, UriSchemeResponder};

pub fn protocol<R: Runtime>(ctx: UriSchemeContext<'_, R>, request: Request<Vec<u8>>, responder: UriSchemeResponder) {
    let store = ctx.app_handle().state::<Store>().inner().clone();
    let id = request.uri().path().trim_matches('/').parse::<i32>().ok();
    tauri::async_runtime::spawn_blocking(move || {
        let image = id.and_then(|id| store.with(|c| linear_store::docs::thumbnail(c, id)).ok().flatten());
        responder.respond(match image {
            Some(bytes) => Response::builder()
                .header(header::CONTENT_TYPE, image_type(&bytes))
                .header(header::CACHE_CONTROL, "max-age=31536000, immutable")
                .body(bytes)
                .unwrap(),
            None => Response::builder().status(StatusCode::NOT_FOUND).body(Vec::new()).unwrap(),
        });
    });
}

/// Thumbnails are drawn as JPEG or PNG; tell them apart by their first bytes.
fn image_type(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(b"\x89PNG") { "image/png" } else { "image/jpeg" }
}
