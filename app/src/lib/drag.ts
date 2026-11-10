// Whether a document card is being dragged inside the window. The window
// also hears that drag as a file drag (Tauri), and this keeps it from
// offering to import it.
export const dragging = { active: false };
