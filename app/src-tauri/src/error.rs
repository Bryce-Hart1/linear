// How a command's failure reaches the page: `{ code, message }`. The message
// is written to be shown as it is; `code` is for the page to branch on.

use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct CmdError {
    pub code: &'static str,
    pub message: String,
}

impl CmdError {
    pub fn internal(e: impl std::fmt::Display) -> CmdError {
        CmdError { code: "internal", message: e.to_string() }
    }
}

impl From<linear_store::Error> for CmdError {
    fn from(e: linear_store::Error) -> CmdError {
        CmdError { code: e.code(), message: e.to_string() }
    }
}

pub type CmdResult<T> = Result<T, CmdError>;
