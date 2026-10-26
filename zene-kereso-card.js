/* Zene kereső kártya – Home Assistant custom card
   Keresés a Music Assistant lejátszón (media_player/search_media), találatok borítóképpel,
   koppintásra lejátszás a célpont lejátszón. Nincs külső függőség. */
const ICONS = {
  track: "mdi:music-note", album: "mdi:album", playlist: "mdi:playlist-music",
  artist: "mdi:account-music", channel: "mdi:radio-tower", radio: "mdi:radio-tower",
  podcast: "mdi:podcast", default: "mdi:music",
};
class ZeneKeresoCard extends HTMLElement {
  static getStubConfig() { return { target_sensor: "sensor.zene_kereso_celpont", fallback: "media_player.eloter_3" }; }
  setConfig(config) {
    this._config = Object.assign({
      target_sensor: "sensor.zene_kereso_celpont",
      fallback: "media_player.eloter_3",
      title: "",
      placeholder_music: "Előadó, dal, album, lista…",
      placeholder_radio: "Rádióállomás neve…",
      volume_if_idle: 0.15,
      max_results: 20,
    }, config);
    this._mode = "music";
    this._results = [];
    this._query = "";
    this._status = "";
    if (!this._root) this._build();
  }
  set hass(hass) { this._hass = hass; if (this._root) this._renderTarget(); }
  getCardSize() { return 4; }
  getGridOptions() { return { columns: "full", rows: "auto" }; }
  _target() {
    const s = this._hass && this._hass.states[this._config.target_sensor];
    const v = s && s.state && s.state.startsWith("media_player.") ? s.state : this._config.fallback;
    return v;
  }
  _build() {
    this._root = this.attachShadow({ mode: "open" });
    this._root.innerHTML = `
      <style>
        :host { display:block; }
        ha-card { padding: 12px; }
        .top { display:flex; gap:8px; align-items:center; }
        .tabs { display:flex; gap:6px; }
        .tab { padding:6px 12px; border-radius:16px; border:1px solid var(--divider-color); cursor:pointer;
               color: var(--secondary-text-color); font-size: 14px; user-select:none; }
        .tab.on { background: var(--primary-color); color:#fff; border-color: var(--primary-color); }
        .box { flex:1; display:flex; align-items:center; gap:8px; background: var(--secondary-background-color, rgba(128,128,128,.18));
               border:1px solid var(--divider-color); border-radius: 12px; padding: 6px 10px; }
        .box ha-icon { color: var(--secondary-text-color); }
        input { flex:1; background: transparent; border:none; outline:none; font-size:17px; color: var(--primary-text-color); min-width: 0; }
        input::placeholder { color: var(--secondary-text-color); opacity: .8; }
        .clear { cursor:pointer; color: var(--secondary-text-color); }
        .status { font-size:13px; color: var(--secondary-text-color); margin: 8px 2px 0; min-height: 16px; }
        .list { margin-top: 8px; display:flex; flex-direction:column; gap:6px; }
        .item { display:flex; align-items:center; gap:12px; padding:6px 8px; border-radius:12px; cursor:pointer;
                background: var(--secondary-background-color, rgba(128,128,128,.12)); }
        .item:active { opacity:.7; }
        .thumb { width:48px; height:48px; border-radius:8px; object-fit:cover; background: rgba(128,128,128,.25); flex:none;
                 display:flex; align-items:center; justify-content:center; color: var(--secondary-text-color); }
        .thumb img { width:100%; height:100%; object-fit:cover; border-radius:8px; }
        .txt { flex:1; min-width:0; }
        .t1 { font-size:15px; color: var(--primary-text-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .t2 { font-size:12px; color: var(--secondary-text-color); }
        .play { color: var(--primary-color); flex:none; }
        .hint { font-size:13px; color: var(--secondary-text-color); padding: 8px 2px; }
      </style>
      <ha-card>
        <div class="top">
          <div class="tabs">
            <div class="tab on" data-mode="music">Zene</div>
            <div class="tab" data-mode="radio">Rádió</div>
          </div>
          <div class="box">
            <ha-icon icon="mdi:magnify"></ha-icon>
            <input type="search" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search">
            <ha-icon class="clear" icon="mdi:close" style="display:none"></ha-icon>
          </div>
        </div>
        <div class="status"></div>
        <div class="list"></div>
      </ha-card>`;
    this._input = this._root.querySelector("input");
    this._list = this._root.querySelector(".list");
    this._statusEl = this._root.querySelector(".status");
    this._clearEl = this._root.querySelector(".clear");
    this._input.placeholder = this._config.placeholder_music;
    this._root.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => this._setMode(t.dataset.mode)));
    this._input.addEventListener("input", () => this._onInput());
    this._input.addEventListener("keydown", e => { if (e.key === "Enter") { clearTimeout(this._timer); this._search(); } });
    this._clearEl.addEventListener("click", () => this._reset());
    this._renderTarget();
  }
  _setMode(m) {
    this._mode = m;
    this._root.querySelectorAll(".tab").forEach(t => t.classList.toggle("on", t.dataset.mode === m));
    this._input.placeholder = m === "radio" ? this._config.placeholder_radio : this._config.placeholder_music;
    this._results = []; this._renderList();
    if (this._input.value.trim()) this._search();
    this._input.focus();
  }
  _onInput() {
    const q = this._input.value;
    this._clearEl.style.display = q ? "" : "none";
    clearTimeout(this._timer);
    if (q.trim().length < 2) { this._results = []; this._renderList(); this._statusEl.textContent = ""; return; }
    this._timer = setTimeout(() => this._search(), 450);
  }
  _reset() {
    this._input.value = ""; this._clearEl.style.display = "none";
    this._results = []; this._renderList(); this._statusEl.textContent = "";
  }
  _renderTarget() {
    if (!this._hass || !this._statusEl || this._results.length) return;
    const hely = this._hass.states["sensor.zene_kereso_hely"];
    if (hely && !this._statusEl.textContent) this._statusEl.textContent = "Ide szól: " + hely.state;
  }
  async _search() {
    const q = this._input.value.trim();
    if (q.length < 2 || !this._hass) return;
    const entity = this._target();
    this._statusEl.textContent = "Keresés…";
    const mySeq = (this._seq = (this._seq || 0) + 1);
    try {
      const msg = { type: "media_player/search_media", entity_id: entity, search_query: q };
      if (this._mode === "radio") msg.media_filter_classes = ["channel"];
      const res = await this._hass.callWS(msg);
      if (mySeq !== this._seq) return;
      let items = (res && res.result) || [];
      const isRadio = it => (it.media_class === "channel") || /radio/i.test(it.media_content_id || "");
      items = items.filter(it => this._mode === "radio" ? isRadio(it) : !isRadio(it));
      this._results = items.slice(0, this._config.max_results);
      this._renderList();
      if (!this._results.length) {
        this._statusEl.textContent = this._mode === "radio"
          ? "Nincs rádiótalálat. (A Music Assistantban a Radio Browser szolgáltatót be kell kapcsolni.)"
          : "Nincs találat.";
      } else this._statusEl.textContent = this._results.length + " találat";
    } catch (e) {
      if (mySeq !== this._seq) return;
      this._statusEl.textContent = "Hiba a keresésnél: " + (e.message || e);
    }
  }
  _renderList() {
    this._list.innerHTML = "";
    for (const it of this._results) {
      const row = document.createElement("div"); row.className = "item";
      const th = document.createElement("div"); th.className = "thumb";
      if (it.thumbnail) { const img = document.createElement("img"); img.src = it.thumbnail; img.loading = "lazy"; th.appendChild(img); }
      else { const ic = document.createElement("ha-icon"); ic.icon = ICONS[it.media_class] || ICONS.default; th.appendChild(ic); }
      const txt = document.createElement("div"); txt.className = "txt";
      const t1 = document.createElement("div"); t1.className = "t1"; t1.textContent = it.title || "";
      const t2 = document.createElement("div"); t2.className = "t2"; t2.textContent = this._label(it);
      txt.appendChild(t1); txt.appendChild(t2);
      const pl = document.createElement("ha-icon"); pl.className = "play"; pl.icon = "mdi:play-circle";
      row.appendChild(th); row.appendChild(txt); row.appendChild(pl);
      row.addEventListener("click", () => this._play(it));
      this._list.appendChild(row);
    }
  }
  _label(it) {
    const m = { track: "dal", album: "album", playlist: "lejátszási lista", artist: "előadó", channel: "rádió", podcast: "podcast" };
    const prov = /^apple_music/.test(it.media_content_id || "") ? " · Apple Music" : /^library:/.test(it.media_content_id || "") ? " · könyvtár" : "";
    return (m[it.media_class] || it.media_class || "") + prov;
  }
  async _play(it) {
    const entity = this._target();
    const st = this._hass.states[entity];
    try {
      if (st && st.state !== "playing") {
        await this._hass.callService("media_player", "volume_set", { entity_id: entity, volume_level: this._config.volume_if_idle });
      }
      await this._hass.callService("media_player", "play_media", {
        entity_id: entity, media_content_id: it.media_content_id, media_content_type: it.media_content_type || "music",
      });
      this._statusEl.textContent = "▶ " + (it.title || "");
      this._results = []; this._renderList();
      this._input.value = ""; this._clearEl.style.display = "none";
    } catch (e) {
      this._statusEl.textContent = "Nem sikerült elindítani: " + (e.message || e);
    }
  }
}
customElements.define("zene-kereso-card", ZeneKeresoCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "zene-kereso-card", name: "Zene kereső kártya", description: "Zene és rádió keresése Music Assistanten, lejátszás a kipipált szobákban." });
