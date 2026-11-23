// Browser recovery scheduling; storage and clock are injected for deterministic failure tests.
class Recovery {
  constructor(write, now = Date.now) { this.write=write; this.now=now; this.delay=0; this.lastSaved=null; this.pending=null; }
  configure(minutes) { this.delay=minutes < 0 ? null : minutes*60000; }
  queue(value) { this.pending=value; return this.flush(); }
  flush(force=false) {
    if (this.pending===null || this.delay===null) return false;
    const now=this.now();
    if (!force && this.lastSaved!==null && now-this.lastSaved < this.delay) return false;
    this.write({...this.pending, savedAt: now});
    this.lastSaved=now; this.pending=null; return true;
  }
  newDocument() { this.lastSaved=null; this.pending=null; }
}
if (typeof module !== 'undefined') module.exports=Recovery;
