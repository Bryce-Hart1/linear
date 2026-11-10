// What can go wrong in the store. Each error has a short `code` the UI can
// branch on; the message is written to be shown as it is.

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("couldn't open the library: {0}")]
    Open(String),
    #[error("couldn't update the library's tables: {0}")]
    Migrate(String),
    #[error("library error: {0}")]
    Db(#[from] diesel::result::Error),
    /// The request itself was wrong: a preference that doesn't exist, a value out of range.
    #[error("{0}")]
    Invalid(String),
    #[error("{0} not found")]
    NotFound(&'static str),
}

impl Error {
    pub fn code(&self) -> &'static str {
        match self {
            Error::Open(_) | Error::Migrate(_) | Error::Db(_) => "store",
            Error::Invalid(_) => "invalid",
            Error::NotFound(_) => "not_found",
        }
    }
}
