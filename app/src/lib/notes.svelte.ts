// Short messages at the bottom of the window: what just happened, what was
// refused and why. A note can carry one action, like Undo after moving
// something to the Trash. Only the newest shows.

export interface Note {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

class Notes {
  current = $state<Note | null>(null);
  private n = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  say(text: string, action?: Note['action']) {
    this.current = { id: ++this.n, text, action };
    clearTimeout(this.timer);
    this.timer = setTimeout(() => (this.current = null), action ? 6000 : 3500);
  }

  dismiss() {
    clearTimeout(this.timer);
    this.current = null;
  }
}

export const notes = new Notes();
