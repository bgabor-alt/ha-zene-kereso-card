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
      radio_api: ["https://de1.api.radio-browser.info", "https://at1.api.radio-browser.info", "https://nl1.api.radio-browser.info"],
      favorites_sensor: "sensor.sonos_favorites",
      favorites_script: "script.zene_lejatszas",
      favorites_mode: "select",
      favorites_label: "Apple rádiók (Sonos-kedvencek)",
      accent: "",
    }, config);
    this._mode = "music";
    this._results = [];
    this._stack = [];
    this._query = "";
    this._status = "";
    if (!this._root) this._build();
  }
  set hass(hass) { this._hass = hass; if (this._root) { this._renderTarget(); this._renderFavs(); } }
  _renderFavs() {
    const mode = this._config.favorites_mode;
    const st = this._config.favorites_sensor ? this._hass.states[this._config.favorites_sensor] : null;
    const items = (st && st.attributes && st.attributes.items) || {};
    const key = mode + JSON.stringify(items);
    if (key === this._favKey) return;
    this._favKey = key;
    this._favsEl.innerHTML = ""; this._favsEl.style.display = "none";
    this._favSelWrap.style.display = "none";
    if (mode === "none" || !Object.keys(items).length) return;
    if (mode === "select") {
      this._favSel.innerHTML = "";
      const ph = document.createElement("option"); ph.value = ""; ph.textContent = this._config.favorites_label; this._favSel.appendChild(ph);
      for (const [id, name] of Object.entries(items)) { const o = document.createElement("option"); o.value = id; o.textContent = name; this._favSel.appendChild(o); }
      this._favSelWrap.style.display = "";
      return;
    }
    for (const [id, name] of Object.entries(items)) {
      const chip = document.createElement("div"); chip.className = "fav";
      const ic = document.createElement("ha-icon"); ic.icon = "mdi:star";
      const t = document.createElement("span"); t.textContent = name;
      chip.appendChild(ic); chip.appendChild(t);
      chip.addEventListener("click", async () => {
        try {
          const [domain, name2] = this._config.favorites_script.split(".");
          await this._hass.callService(domain, name2, { fav_id: id });
          this._statusEl.textContent = "▶ " + name;
        } catch (e) { this._statusEl.textContent = "Nem sikerült: " + (e.message || e); }
      });
      this._favsEl.appendChild(chip);
    }
    this._favsEl.style.display = "";
  }
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
        :host { display:block; --zk-accent: var(--primary-color); }
        ha-card { padding: 12px; box-sizing: border-box; overflow: hidden; }
        .top { display:flex; gap:8px; align-items:center; flex-wrap: wrap; }
        .tabs { display:flex; gap:6px; flex: none; }
        .tab { padding:6px 12px; border-radius:16px; border:1px solid var(--divider-color); cursor:pointer;
               color: var(--secondary-text-color); font-size: 14px; user-select:none; }
        .tab.on { background: var(--zk-accent); color:#fff; border-color: var(--zk-accent); }
        .box { flex: 1 1 180px; min-width: 0; box-sizing: border-box; display:flex; align-items:center; gap:8px; background: var(--secondary-background-color, rgba(128,128,128,.18));
               border:1px solid var(--divider-color); border-radius: 12px; padding: 6px 10px; }
        .box ha-icon { color: var(--zk-accent); }
        input { flex:1; width: 100%; min-width: 0; box-sizing: border-box; -webkit-appearance: none; appearance: none; background: transparent; border:none; outline:none; font-size:17px; color: var(--primary-text-color); min-width: 0; }
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
        .play { color: var(--zk-accent); flex:none; }
        .hint { font-size:13px; color: var(--secondary-text-color); padding: 8px 2px; }
        .favs { display:flex; flex-wrap:wrap; gap:8px; margin: 0 0 10px; }
        .favsel { display:flex; align-items:center; gap:8px; margin: 0 0 10px; background: var(--secondary-background-color, rgba(128,128,128,.18));
                  border:1px solid var(--divider-color); border-radius:12px; padding: 6px 10px; }
        .favsel ha-icon { color: var(--zk-accent); flex:none; }
        .favsel select { flex:1; min-width:0; background: transparent; border:none; outline:none; font-size:16px; color: var(--primary-text-color);
                         -webkit-appearance:none; appearance:none; padding: 6px 0; }
        .favsel select option { color: #000; background: #fff; }
        .favsel .arrow { color: var(--secondary-text-color); flex:none; }
        .fav { display:flex; align-items:center; gap:6px; padding:8px 14px; border-radius:18px; cursor:pointer; font-size:15px;
               background: var(--secondary-background-color, rgba(128,128,128,.15)); color: var(--primary-text-color); border:1px solid var(--divider-color); user-select:none; }
        .fav:active { opacity:.7; }
        .fav ha-icon { color: var(--zk-accent); --mdc-icon-size: 20px; }
        .sec { font-size:12px; letter-spacing:.04em; text-transform:uppercase; color: var(--secondary-text-color); margin: 10px 4px 2px; }
        .open { color: var(--secondary-text-color); flex:none; }
        .nav { display:flex; align-items:center; gap:10px; margin-top:8px; padding:6px 4px; }
        .nav .back { cursor:pointer; color: var(--zk-accent); }
        .nav .nt { flex:1; min-width:0; font-size:15px; color: var(--primary-text-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .nav .all { cursor:pointer; color:#fff; background: var(--zk-accent); border-radius:14px; padding:4px 10px; font-size:13px; flex:none; }
      input::-webkit-search-decoration, input::-webkit-search-cancel-button { -webkit-appearance: none; }
      </style>
      <ha-card>
        <div class="favsel" style="display:none"><ha-icon icon="mdi:apple"></ha-icon><select></select><ha-icon class="arrow" icon="mdi:menu-down"></ha-icon></div>
        <div class="favs"></div>
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
    this._favsEl = this._root.querySelector(".favs");
    this._favSelWrap = this._root.querySelector(".favsel");
    this._favSel = this._root.querySelector(".favsel select");
    this._favSel.addEventListener("change", async () => {
      const id = this._favSel.value; if (!id) return;
      const name = this._favSel.options[this._favSel.selectedIndex].textContent;
      try {
        const [domain, name2] = this._config.favorites_script.split(".");
        await this._hass.callService(domain, name2, { fav_id: id });
        this._statusEl.textContent = "▶ " + name;
      } catch (e) { this._statusEl.textContent = "Nem sikerült: " + (e.message || e); }
      setTimeout(() => { this._favSel.value = ""; }, 1500);
    });
    this._input = this._root.querySelector("input");
    this._list = this._root.querySelector(".list");
    this._statusEl = this._root.querySelector(".status");
    this._clearEl = this._root.querySelector(".clear");
    this._input.placeholder = this._config.placeholder_music;
    if (this._config.accent) this.style.setProperty("--zk-accent", this._config.accent);
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
    this._results = []; this._stack = []; this._renderList(); this._statusEl.textContent = "";
  }
  _renderTarget() {}
  async _search() {
    const q = this._input.value.trim();
    if (q.length < 2 || !this._hass) return;
    const entity = this._target();
    this._statusEl.textContent = "Keresés…";
    const mySeq = (this._seq = (this._seq || 0) + 1);
    try {
      let items = [];
      if (this._mode === "radio") {
        items = await this._searchRadio(q);
      } else {
        const res = await this._hass.callWS({ type: "media_player/search_media", entity_id: entity, search_query: q });
        items = ((res && res.result) || []).filter(it => it.media_class !== "channel");
      }
      if (mySeq !== this._seq) return;
      this._results = items.slice(0, this._config.max_results);
      this._stack = [];
      this._renderList();
      this._statusEl.textContent = this._results.length ? this._results.length + " találat" : "Nincs találat.";
    } catch (e) {
      if (mySeq !== this._seq) return;
      this._statusEl.textContent = "Hiba a keresésnél: " + (e.message || e);
    }
  }
  async _searchRadio(q) {
    const params = "?name=" + encodeURIComponent(q) + "&limit=" + this._config.max_results + "&order=votes&reverse=true&hidebroken=true";
    let lastErr = null;
    for (const base of this._config.radio_api) {
      try {
        const r = await fetch(base + "/json/stations/search" + params, { headers: { "User-Agent": "ha-zene-kereso-card/1.2" } });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const st = await r.json();
        return st.map(s => ({
          title: s.name, media_class: "channel", media_content_type: "music",
          media_content_id: s.url_resolved || s.url, thumbnail: s.favicon || "",
          extra: [s.country, s.codec ? s.codec + (s.bitrate ? " " + s.bitrate + " kb/s" : "") : "", s.tags ? s.tags.split(",").slice(0, 3).join(", ") : ""].filter(Boolean).join(" · "),
        }));
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("Rádió-adatbázis nem elérhető");
  }
  _isContainer(it) { return ["album", "playlist", "artist", "directory"].includes(it.media_class) || it.can_expand === true; }
  _row(it, inContainer) {
    const row = document.createElement("div"); row.className = "item";
    const th = document.createElement("div"); th.className = "thumb";
    if (it.thumbnail) { const img = document.createElement("img"); img.src = it.thumbnail; img.loading = "lazy"; th.appendChild(img); }
    else { const ic = document.createElement("ha-icon"); ic.icon = ICONS[it.media_class] || ICONS.default; th.appendChild(ic); }
    const txt = document.createElement("div"); txt.className = "txt";
    const t1 = document.createElement("div"); t1.className = "t1"; t1.textContent = it.title || "";
    const t2 = document.createElement("div"); t2.className = "t2"; t2.textContent = this._label(it);
    txt.appendChild(t1); txt.appendChild(t2);
    row.appendChild(th); row.appendChild(txt);
    if (this._isContainer(it)) {
      const open = document.createElement("ha-icon"); open.className = "open"; open.icon = "mdi:chevron-right";
      const pl = document.createElement("ha-icon"); pl.className = "play"; pl.icon = "mdi:play-circle";
      pl.addEventListener("click", e => { e.stopPropagation(); this._play(it); });
      row.appendChild(pl); row.appendChild(open);
      row.addEventListener("click", () => this._openContainer(it));
    } else {
      const pl = document.createElement("ha-icon"); pl.className = "play"; pl.icon = "mdi:play-circle";
      row.appendChild(pl);
      row.addEventListener("click", () => this._play(it));
    }
    return row;
  }
  _renderList() {
    this._list.innerHTML = "";
    if (this._stack.length) {
      const top = this._stack[this._stack.length - 1];
      const nav = document.createElement("div"); nav.className = "nav";
      const back = document.createElement("ha-icon"); back.className = "back"; back.icon = "mdi:arrow-left";
      back.addEventListener("click", () => { this._stack.pop(); this._renderList(); });
      const nt = document.createElement("div"); nt.className = "nt"; nt.textContent = top.item.title || "";
      const all = document.createElement("div"); all.className = "all"; all.textContent = "▶ Mind";
      all.addEventListener("click", () => this._play(top.item));
      nav.appendChild(back); nav.appendChild(nt); nav.appendChild(all);
      this._list.appendChild(nav);
      for (const it of top.children) this._list.appendChild(this._row(it, true));
      return;
    }
    const groups = [["track", "Dalok"], ["album", "Albumok"], ["playlist", "Lejátszási listák"], ["artist", "Előadók"], ["channel", "Rádiók"]];
    const used = new Set();
    for (const [cls, title] of groups) {
      const items = this._results.filter(it => it.media_class === cls);
      if (!items.length) continue;
      const h = document.createElement("div"); h.className = "sec"; h.textContent = title; this._list.appendChild(h);
      for (const it of items) { used.add(it); this._list.appendChild(this._row(it, false)); }
    }
    const rest = this._results.filter(it => !used.has(it));
    for (const it of rest) this._list.appendChild(this._row(it, false));
  }
  async _openContainer(it) {
    if (!this._hass) return;
    const entity = this._target();
    this._statusEl.textContent = "Megnyitás…";
    try {
      const res = await this._hass.callWS({ type: "media_player/browse_media", entity_id: entity,
        media_content_type: it.media_content_type || it.media_class, media_content_id: it.media_content_id });
      const children = (res && res.children) || [];
      this._stack.push({ item: it, children });
      this._statusEl.textContent = children.length + " elem";
      this._renderList();
    } catch (e) { this._statusEl.textContent = "Nem sikerült megnyitni: " + (e.message || e); }
  }
  _label(it) {
    if (it.extra) return it.extra;
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
      this._results = []; this._stack = []; this._renderList();
      this._input.value = ""; this._clearEl.style.display = "none";
    } catch (e) {
      this._statusEl.textContent = "Nem sikerült elindítani: " + (e.message || e);
    }
  }
}
customElements.define("zene-kereso-card", ZeneKeresoCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "zene-kereso-card", name: "Zene kereső kártya", description: "Zene és rádió keresése Music Assistanten, lejátszás a kipipált szobákban." });

/* ===================== Ébresztő kártya ===================== */
const EB_DAYS = ["H", "K", "Sz", "Cs", "P", "Sz", "V"];
class ZeneEbresztoCard extends HTMLElement {
  static getStubConfig() { return { slots: ["input_text.ebreszto_1"] }; }
  setConfig(config) {
    this._config = Object.assign({
      slots: [], script_test: "script.ebreszto_program_inditas", accent: "",
      rooms: ["Előtér", "Konyha-étkező", "Nappali", "Dolgozószoba", "Hálószoba", "Gyerek nappali", "Zéli szoba", "Bogi szoba", "Edzőterem", "Terasz"],
      group_names: ["input_text.zene_csoport_1_nev", "input_text.zene_csoport_2_nev", "input_text.zene_csoport_3_nev"],
      group_prefix: "input_boolean.zene_csoport_",
      room_keys: { "Előtér": "eloter", "Konyha-étkező": "konyha_etkezo", "Nappali": "nappali", "Dolgozószoba": "dolgozoszoba", "Hálószoba": "haloszoba", "Gyerek nappali": "gyerek_nappali", "Zéli szoba": "zeli_szoba", "Bogi szoba": "bogi_szoba", "Edzőterem": "edzoterem", "Terasz": "terasz" },
      favorites_sensor: "sensor.sonos_favorites",
      music_extra: [["ma:library://playlist/10", "Chill lista"], ["ma:library://playlist/14", "Kedvenc dalok"], ["ma:library://playlist/1", "Minden kedvenc"], ["ma:library://playlist/8", "Végtelen mix"]],
      title: "Ébresztők",
    }, config);
    this._open = null;
    if (!this._root) this._build();
  }
  set hass(hass) { this._hass = hass; if (this._root) this._render(); }
  getCardSize() { return 6; }
  getGridOptions() { return { columns: "full", rows: "auto" }; }
  _build() {
    this._root = this.attachShadow({ mode: "open" });
    this._root.innerHTML = `
      <style>
        :host { display:block; --zk-accent: var(--primary-color); }
        ha-card { padding: 12px; box-sizing:border-box; overflow:hidden; }
        .hdr { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
        .hdr .t { flex:1; font-size:18px; font-weight:500; color: var(--primary-text-color); }
        .btn { cursor:pointer; color:#fff; background: var(--zk-accent); border-radius:16px; padding:6px 14px; font-size:14px; user-select:none; display:inline-flex; align-items:center; gap:6px; }
        .btn.sec { background: transparent; color: var(--zk-accent); border:1px solid var(--zk-accent); }
        .btn.danger { background: transparent; color: var(--error-color, #e53935); border:1px solid var(--error-color, #e53935); }
        .row { background: var(--secondary-background-color, rgba(128,128,128,.12)); border-radius:14px; padding:10px 12px; margin-bottom:8px; }
        .row.off { opacity:.6; }
        .line { display:flex; align-items:center; gap:12px; cursor:pointer; }
        .time { font-size:28px; font-weight:500; color: var(--primary-text-color); min-width:84px; }
        .info { flex:1; min-width:0; }
        .n { font-size:15px; color: var(--primary-text-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .s { font-size:13px; color: var(--secondary-text-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .sw { width:46px; height:26px; border-radius:13px; background: var(--disabled-color, #666); position:relative; flex:none; transition: background .2s; }
        .sw.on { background: var(--zk-accent); }
        .sw::after { content:""; position:absolute; top:3px; left:3px; width:20px; height:20px; border-radius:50%; background:#fff; transition:left .2s; }
        .sw.on::after { left:23px; }
        .x { flex:none; width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer;
             color: var(--secondary-text-color); border:1px solid var(--divider-color); }
        .x:active { color: var(--error-color, #e53935); border-color: var(--error-color, #e53935); }
        .edit { margin-top:10px; display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
        .edit .full { grid-column: 1 / -1; }
        label { display:block; font-size:12px; color: var(--secondary-text-color); margin-bottom:4px; }
        input, select { width:100%; box-sizing:border-box; background: var(--card-background-color); color: var(--primary-text-color); border:1px solid var(--divider-color);
                        border-radius:10px; padding:8px 10px; font-size:16px; outline:none; -webkit-appearance:none; appearance:none; }
        input[type=time] { font-size:22px; }
        select option { color:#000; background:#fff; }
        .days { display:flex; gap:6px; flex-wrap:wrap; }
        .day { width:38px; height:38px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:14px;
               border:1px solid var(--divider-color); color: var(--secondary-text-color); user-select:none; }
        .day.on { background: var(--zk-accent); color:#fff; border-color: var(--zk-accent); }
        .rooms { display:flex; flex-wrap:wrap; gap:6px; }
        .chip { padding:8px 12px; border-radius:16px; border:1px solid var(--divider-color); color: var(--secondary-text-color); cursor:pointer; font-size:14px; user-select:none; }
        .chip.on { background: var(--zk-accent); color:#fff; border-color: var(--zk-accent); }
        .chip.grp { border-style: dashed; color: var(--primary-text-color); }
        .vol { display:flex; align-items:center; gap:8px; }
        .vol input[type=range] { -webkit-appearance:none; appearance:none; width:100%; height:40px; padding:0; margin:0; border:none; border-radius:12px; cursor:pointer;
             background: linear-gradient(to right, var(--zk-accent) 0 var(--val, 20%), rgba(128,128,128,.25) var(--val, 20%) 100%); }
        .vol input[type=range]::-webkit-slider-runnable-track { height:40px; background: transparent; border-radius:12px; }
        .vol input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:28px; margin-top:6px; border-radius:7px; background:#fff; box-shadow: 0 0 2px rgba(0,0,0,.5); }
        .vol input[type=range]::-moz-range-track { height:40px; background: transparent; border-radius:12px; }
        .vol input[type=range]::-moz-range-thumb { width:14px; height:28px; border:none; border-radius:7px; background:#fff; }
        .vol span { min-width:40px; text-align:right; color: var(--primary-text-color); }
        .acts { display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap; }
        .empty { color: var(--secondary-text-color); font-size:14px; padding:6px 2px; }
      </style>
      <ha-card>
        <div class="hdr"><div class="t"></div><div class="btn add"><ha-icon icon="mdi:plus"></ha-icon>Új ébresztő</div></div>
        <div class="list"></div>
      </ha-card>`;
    if (this._config.accent) this.style.setProperty("--zk-accent", this._config.accent);
    this._root.querySelector(".t").textContent = this._config.title;
    this._list = this._root.querySelector(".list");
    this._root.querySelector(".add").addEventListener("click", () => this._add());
  }
  _read(slot) {
    const st = this._hass.states[slot];
    if (!st || !st.state || st.state === "unknown") return null;
    try { const p = JSON.parse(st.state); return (p && p.t) ? p : null; } catch (e) { return null; }
  }
  async _write(slot, p) {
    const v = p ? JSON.stringify(p) : "";
    await this._hass.callService("input_text", "set_value", { entity_id: slot, value: v });
  }
  _whereOptions() {
    const o = [["Mindenhol", "Mindenhol"]];
    this._config.group_names.forEach((e, i) => { const st = this._hass.states[e]; o.push(["Csoport " + (i + 1), (st ? st.state : "Csoport " + (i + 1))]); });
    this._config.rooms.forEach(r => o.push([r, r]));
    return o;
  }
  _musicOptions() {
    const o = [];
    const st = this._hass.states[this._config.favorites_sensor];
    const items = (st && st.attributes && st.attributes.items) || {};
    for (const [id, name] of Object.entries(items)) o.push(["fav:" + id, name]);
    for (const [id, name] of this._config.music_extra) o.push([id, name]);
    return o;
  }
  _label(v, opts) { if (Array.isArray(v)) { const all = this._config.rooms; return v.length === all.length ? "Mindenhol" : (v.length ? v.join(", ") : "—"); } const f = opts.find(x => x[0] === v); return f ? f[1] : v; }
  _groupRooms(g) { return this._config.rooms.filter(r => { const st = this._hass.states[this._config.group_prefix + g + "_" + this._config.room_keys[r]]; return st && st.state === "on"; }); }
  _daysText(d) {
    const s = (d || []).slice().sort().join(",");
    if (s === "0,1,2,3,4") return "Hétköznap"; if (s === "5,6") return "Hétvége"; if (s === "0,1,2,3,4,5,6") return "Minden nap";
    if (!s) return "Egyszer";
    return (d || []).slice().sort().map(i => EB_DAYS[i]).join(" ");
  }
  _add() {
    const slot = this._config.slots.find(s => !this._read(s));
    if (!slot) { alert("Nincs több szabad ébresztő-hely (" + this._config.slots.length + ")."); return; }
    const p = { n: "Ébresztő", on: 1, t: "07:00", d: [0, 1, 2, 3, 4], w: ["Hálószoba"], m: (this._musicOptions()[0] || ["fav:FV:2/0"])[0], v: 20 };
    this._write(slot, p).then(() => { this._open = slot; });
  }
  _render() {
    if (!this._hass || !this._list) return;
    const key = this._config.slots.map(s => (this._hass.states[s] || {}).state).join("|") + "#" + this._open;
    if (key === this._key) return; this._key = key;
    this._list.innerHTML = "";
    const W = this._whereOptions(), M = this._musicOptions();
    let n = 0;
    for (const slot of this._config.slots) {
      const p = this._read(slot); if (!p) continue; n++;
      const row = document.createElement("div"); row.className = "row" + (p.on ? "" : " off");
      const line = document.createElement("div"); line.className = "line";
      const time = document.createElement("div"); time.className = "time"; time.textContent = p.t;
      const info = document.createElement("div"); info.className = "info";
      const nm = document.createElement("div"); nm.className = "n"; nm.textContent = p.n || "Ébresztő";
      const sub = document.createElement("div"); sub.className = "s"; sub.textContent = this._daysText(p.d) + " · " + this._label(p.w, W) + " · " + this._label(p.m, M) + " · " + (p.v || 20) + "%";
      info.appendChild(nm); info.appendChild(sub);
      const sw = document.createElement("div"); sw.className = "sw" + (p.on ? " on" : "");
      sw.addEventListener("click", e => { e.stopPropagation(); this._write(slot, Object.assign({}, p, { on: p.on ? 0 : 1 })); });
      const x = document.createElement("div"); x.className = "x"; const xi = document.createElement("ha-icon"); xi.icon = "mdi:close"; x.appendChild(xi);
      x.addEventListener("click", e => { e.stopPropagation(); if (confirm("Törlöd ezt az ébresztőt?")) { if (this._open === slot) this._open = null; this._write(slot, null); } });
      line.appendChild(time); line.appendChild(info); line.appendChild(sw); line.appendChild(x);
      line.addEventListener("click", () => { this._open = (this._open === slot) ? null : slot; this._key = ""; this._render(); });
      row.appendChild(line);
      if (this._open === slot) row.appendChild(this._editor(slot, p, W, M));
      this._list.appendChild(row);
    }
    if (!n) { const e = document.createElement("div"); e.className = "empty"; e.textContent = "Nincs ébresztő. Koppints az „Új ébresztő” gombra."; this._list.appendChild(e); }
  }
  _editor(slot, p, W, M) {
    const ed = document.createElement("div"); ed.className = "edit";
    const cur = Object.assign({}, p);
    const field = (lbl, el, full) => { const w = document.createElement("div"); if (full) w.className = "full"; const l = document.createElement("label"); l.textContent = lbl; w.appendChild(l); w.appendChild(el); return w; };
    const name = document.createElement("input"); name.type = "text"; name.value = cur.n || ""; name.maxLength = 30; name.addEventListener("input", () => cur.n = name.value);
    const time = document.createElement("input"); time.type = "time"; time.value = cur.t; time.addEventListener("input", () => { if (time.value) cur.t = time.value; });
    const days = document.createElement("div"); days.className = "days";
    EB_DAYS.forEach((d, i) => { const c = document.createElement("div"); c.className = "day" + ((cur.d || []).includes(i) ? " on" : ""); c.textContent = d;
      c.addEventListener("click", () => { const set = new Set(cur.d || []); set.has(i) ? set.delete(i) : set.add(i); cur.d = [...set].sort(); c.classList.toggle("on"); }); days.appendChild(c); });
    const where = document.createElement("div"); where.className = "rooms";
    if (!Array.isArray(cur.w)) cur.w = (cur.w === "Mindenhol") ? this._config.rooms.slice() : (String(cur.w).startsWith("Csoport ") ? this._groupRooms(String(cur.w).slice(-1)) : [cur.w]);
    const chips = {};
    const sync = () => { this._config.rooms.forEach(r => chips[r].classList.toggle("on", cur.w.includes(r))); };
    const grp = (label, rooms) => { const c = document.createElement("div"); c.className = "chip grp"; c.textContent = label; c.addEventListener("click", () => { cur.w = rooms(); sync(); }); where.appendChild(c); };
    grp("Mindenhol", () => this._config.rooms.slice());
    this._config.group_names.forEach((e, i) => { const st = this._hass.states[e]; grp(st ? st.state : "Csoport " + (i + 1), () => this._groupRooms(i + 1)); });
    this._config.rooms.forEach(r => { const c = document.createElement("div"); c.className = "chip"; c.textContent = r; chips[r] = c;
      c.addEventListener("click", () => { cur.w = cur.w.includes(r) ? cur.w.filter(x => x !== r) : cur.w.concat([r]); sync(); }); where.appendChild(c); });
    sync();
    const music = document.createElement("select"); M.forEach(([v, l]) => { const o = document.createElement("option"); o.value = v; o.textContent = l; if (v === cur.m) o.selected = true; music.appendChild(o); }); music.addEventListener("change", () => cur.m = music.value);
    const vol = document.createElement("div"); vol.className = "vol"; const r = document.createElement("input"); r.type = "range"; r.min = 5; r.max = 60; r.step = 5; r.value = cur.v || 20;
    const vs = document.createElement("span"); vs.textContent = r.value + "%";
    const paint = () => r.style.setProperty("--val", ((r.value - r.min) / (r.max - r.min) * 100) + "%");
    r.addEventListener("input", () => { cur.v = +r.value; vs.textContent = r.value + "%"; paint(); }); paint(); vol.appendChild(r); vol.appendChild(vs);
    ed.appendChild(field("Név", name)); ed.appendChild(field("Időpont", time));
    ed.appendChild(field("Napok", days, true));
    ed.appendChild(field("Hol szóljon", where, true)); ed.appendChild(field("Mi szóljon", music, true));
    ed.appendChild(field("Célhangerő", vol, true));
    const acts = document.createElement("div"); acts.className = "acts full";
    const test = document.createElement("div"); test.className = "btn sec"; test.innerHTML = '<ha-icon icon="mdi:play"></ha-icon>Próba most';
    test.addEventListener("click", async () => { await this._hass.callService("script", "turn_on", { entity_id: this._config.script_test, variables: { slot: slot } }); });
    const save = document.createElement("div"); save.className = "btn"; save.innerHTML = '<ha-icon icon="mdi:check"></ha-icon>Mentés';
    save.addEventListener("click", async () => { await this._write(slot, cur); this._open = null; this._key = ""; this._render(); });
    acts.appendChild(test); acts.appendChild(save); ed.appendChild(acts);
    return ed;
  }
}
customElements.define("zene-ebreszto-card", ZeneEbresztoCard);
window.customCards.push({ type: "zene-ebreszto-card", name: "Zene ébresztő kártya", description: "Több zenés ébresztő-program, helyben szerkeszthető." });
