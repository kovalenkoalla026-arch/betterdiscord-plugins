/**
 * @name SmartStatus
 * @author Antigravity
 * @description Automatically changes your status based on focus and activity.
 * @version 1.0.0
 * @website https://github.com/kovalenkoalla026-arch/betterdiscord-plugins
 * @source https://github.com/kovalenkoalla026-arch/betterdiscord-plugins/blob/main/SmartStatus.plugin.js
 */

class SmartStatus {
  constructor(meta) {
    this.meta = meta;
    this.defaultSettings = {
      idleDelay: 2, // 2 minutes
      activeStatus: "online",
      inactiveStatus: "dnd",
      idleStatus: "idle",
      enabled: true
    };
    this.settings = {};
    this.currentStatus = null;
    this.isFocused = false;
    this.idleTimer = null;
    
    // Bind listeners
    this.handleFocus = this.handleFocus.bind(this);
    this.handleBlur = this.handleBlur.bind(this);
    this.resetIdleTimer = this.resetIdleTimer.bind(this);
  }

  load() {
    this.settings = BdApi.Data.load(this.meta.name, "settings") || this.defaultSettings;
    
    // Resolve token modules
    this.modules = this.modules || (() => {
      let m = [];
      webpackChunkdiscord_app.push([[`SmartStatus-${Math.random()}`], {}, e => {
        m = m.concat(Object.values(e.c || {}));
      }]);
      return m;
    })();

    try {
      this.authToken = this.modules.find(m => m.exports?.default?.getToken?.name === "getToken")?.exports?.default?.getToken() || (() => {
        let proxy = document.createElement("iframe");
        document.body.appendChild(proxy);
        let token = Object.assign({}, proxy.contentWindow).window.localStorage["token"];
        document.body.removeChild(proxy);
        return JSON.parse(token);
      })();
    } catch(e) {
      console.error("[SmartStatus] Failed to resolve auth token", e);
    }
  }

  start() {
    this.isFocused = document.hasFocus();
    this.setupListeners();
    this.updateState();
  }

  stop() {
    this.removeListeners();
    if (this.idleTimer) clearTimeout(this.idleTimer);
    // Reset to online when stopping the plugin
    this.setStatus("online");
  }

  getAuthToken() {
    if (this.authToken) return this.authToken;
    try {
      this.load();
    } catch(e) {}
    return this.authToken;
  }

  setStatus(status) {
    const token = this.getAuthToken();
    if (!token) return;

    if (this.currentStatus === status) return;
    this.currentStatus = status;

    const req = new XMLHttpRequest();
    req.open("PATCH", "/api/v9/users/@me/settings", true);
    req.setRequestHeader("authorization", token);
    req.setRequestHeader("content-type", "application/json");
    req.onload = () => {
      if (req.status >= 400) {
        console.error(`[SmartStatus] Error: ${req.status} - ${req.responseText}`);
      }
    };
    req.send(JSON.stringify({ status: status }));
  }

  setupListeners() {
    window.addEventListener("focus", this.handleFocus);
    window.addEventListener("blur", this.handleBlur);
    
    // Activity tracking for idle status
    window.addEventListener("mousemove", this.resetIdleTimer);
    window.addEventListener("mousedown", this.resetIdleTimer);
    window.addEventListener("keydown", this.resetIdleTimer);
    window.addEventListener("wheel", this.resetIdleTimer);
  }

  removeListeners() {
    window.removeEventListener("focus", this.handleFocus);
    window.removeEventListener("blur", this.handleBlur);
    window.removeEventListener("mousemove", this.resetIdleTimer);
    window.removeEventListener("mousedown", this.resetIdleTimer);
    window.removeEventListener("keydown", this.resetIdleTimer);
    window.removeEventListener("wheel", this.resetIdleTimer);
  }

  handleFocus() {
    this.isFocused = true;
    this.updateState();
  }

  handleBlur() {
    this.isFocused = false;
    this.updateState();
  }

  resetIdleTimer() {
    if (!this.isFocused) {
      // If we got activity but window is blurred, update focus state
      this.isFocused = true;
    }
    this.updateState();
  }

  updateState() {
    if (this.idleTimer) clearTimeout(this.idleTimer);

    if (!this.isFocused) {
      // Blurred - another app is active on screen
      this.setStatus(this.settings.inactiveStatus);
    } else {
      // Focused - Discord is active
      this.setStatus(this.settings.activeStatus);

      // Start idle timer
      const delayMs = (this.settings.idleDelay || 2) * 60 * 1000;
      this.idleTimer = setTimeout(() => {
        if (this.isFocused) {
          this.setStatus(this.settings.idleStatus);
        }
      }, delayMs);
    }
  }

  getSettingsPanel() {
    const container = document.createElement("div");
    container.style.padding = "15px";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "15px";

    // Style helper for labels and titles
    const createLabel = (text) => {
      const el = document.createElement("h5");
      el.className = "bd-settings-title bd-settings-group-title";
      el.innerText = text;
      el.style.color = "var(--text-normal)";
      el.style.fontSize = "14px";
      el.style.fontWeight = "600";
      return el;
    };

    // Style helper for selects
    const createSelect = (value, onChange) => {
      const select = document.createElement("select");
      select.className = "bd-select";
      select.style.padding = "8px";
      select.style.borderRadius = "4px";
      select.style.backgroundColor = "var(--background-secondary)";
      select.style.color = "var(--text-normal)";
      select.style.border = "1px solid var(--background-tertiary)";
      
      const options = [
        { value: "online", label: "Online (В сети)" },
        { value: "idle", label: "Idle (Неактивен)" },
        { value: "dnd", label: "Do Not Disturb (Не беспокоить)" },
        { value: "invisible", label: "Invisible (Невидимый)" }
      ];

      options.forEach(opt => {
        const option = document.createElement("option");
        option.value = opt.value;
        option.innerText = opt.label;
        if (opt.value === value) option.selected = true;
        select.appendChild(option);
      });

      select.onchange = (e) => onChange(e.target.value);
      return select;
    };

    // Active status configuration
    const activeSection = container.appendChild(document.createElement("div"));
    activeSection.appendChild(createLabel("Статус, когда открыт Дискорд (активное окно):"));
    const activeSelect = activeSection.appendChild(createSelect(this.settings.activeStatus, (val) => {
      this.settings.activeStatus = val;
      this.saveSettings();
    }));

    // Inactive status configuration
    const inactiveSection = container.appendChild(document.createElement("div"));
    inactiveSection.appendChild(createLabel("Статус, когда открыто другое приложение (окно размыто):"));
    const inactiveSelect = inactiveSection.appendChild(createSelect(this.settings.inactiveStatus, (val) => {
      this.settings.inactiveStatus = val;
      this.saveSettings();
    }));

    // Idle status configuration
    const idleSection = container.appendChild(document.createElement("div"));
    idleSection.appendChild(createLabel("Статус, когда активен Дискорд, но нет действий на ПК:"));
    const idleSelect = idleSection.appendChild(createSelect(this.settings.idleStatus, (val) => {
      this.settings.idleStatus = val;
      this.saveSettings();
    }));

    // Idle delay setting
    const delaySection = container.appendChild(document.createElement("div"));
    delaySection.appendChild(createLabel("Время бездействия для перехода в неактивность (в минутах):"));
    const delayInput = document.createElement("input");
    delayInput.type = "number";
    delayInput.className = "bd-select";
    delayInput.style.padding = "8px";
    delayInput.style.width = "100px";
    delayInput.value = this.settings.idleDelay;
    delayInput.min = 1;
    delayInput.onchange = (e) => {
      const val = parseInt(e.target.value) || 2;
      this.settings.idleDelay = val < 1 ? 1 : val;
      this.saveSettings();
    };
    delaySection.appendChild(delayInput);

    return container;
  }

  saveSettings() {
    BdApi.Data.save(this.meta.name, "settings", this.settings);
    this.updateState();
  }
}

module.exports = SmartStatus;
