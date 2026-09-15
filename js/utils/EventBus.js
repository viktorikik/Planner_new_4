export const EventBus = {
  _events: {},
  on(event, callback) {
    if (!this._events[event]) this._events[event] = [];
    this._events[event].push(callback);
  },
  off(event, callback) {
    if (!this._events[event]) return;
    this._events[event] = this._events[event].filter(cb => cb !== callback);
  },
  emit(event, data) {
    if (!this._events[event]) return;
    this._events[event].forEach(cb => cb(data));
  }
};
