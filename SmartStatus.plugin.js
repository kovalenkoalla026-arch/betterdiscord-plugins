/**
 * @name SmartStatus
 * @author senkih
 * @description Automatically changes your status based on focus and activity.
 * @version 1.0.3
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
    this.pollTimer = null;
    this.lastActivityTime = Date.now();
    
    // Bind listeners
    this.handleFocus = this.handleFocus.bind(this);
    this.handleBlur = this.handleBlur.bind(this);
    this.resetIdleTimer = this.resetIdleTimer.bind(this);
  }

  load() {
    this.settings = BdApi.Data.load(this.meta.name, "settings") || this.defaultSettings;
  }

  start() {
    console.log("[SmartStatus] Plugin starting...");
    this.isFocused = document.hasFocus();
    this.lastActivityTime = Date.now();
    console.log(`[SmartStatus] Initial window focus state: ${this.isFocused}`);
    
    // Webpack scanning for idle-related modules
    try {
      console.log("[SmartStatus] Scanning Webpack for idle/presence/focus modules...");
      const allModules = BdApi.Webpack.getAllModules() || [];
      console.log(`[SmartStatus] Found ${allModules.length} total modules in Webpack.`);
      for (let i = 0; i < allModules.length; i++) {
        const m = allModules[i];
        if (!m) continue;
        
        const keys = Object.keys(m);
        const hasIdle = keys.some(k => k.toLowerCase().includes("idle"));
        const hasPresence = keys.some(k => k.toLowerCase().includes("presence"));
        const hasFocus = keys.some(k => k.toLowerCase().includes("focus"));
        
        if (hasIdle || hasPresence || hasFocus) {
          const name = m.getName ? m.getName() : (m.default && m.default.getName ? m.default.getName() : "Unknown");
          console.log(`[SmartStatus] Scan Match [${i}]: name=${name}, keys=${JSON.stringify(keys)}`);
        }
      }
    } catch(e) {
      console.error("[SmartStatus] Error scanning Webpack:", e);
    }
    
    this.setupListeners();

    // Start periodic polling for system idle (every 5 seconds)
    this.pollTimer = setInterval(() => {
      this.updateState();
    }, 5000);

    this.updateState();
  }

  stop() {
    console.log("[SmartStatus] Plugin stopping...");
    this.removeListeners();
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    // Reset to online when stopping the plugin
    this.setStatus("online");
  }

  getAuthToken() {
    if (this.authToken && this.authToken.length > 30) return this.authToken;
    
    console.log("[SmartStatus] getAuthToken: attempting to find token...");

    // Method 1: BdApi.Webpack.getStore("AuthenticationStore")
    try {
      const authStore = BdApi.Webpack.getStore("AuthenticationStore");
      if (authStore && typeof authStore.getToken === "function") {
        const tok = authStore.getToken();
        if (tok && typeof tok === "string" && tok.length > 30) {
          console.log("[SmartStatus] getAuthToken: Found token via BdApi.Webpack.getStore('AuthenticationStore')");
          this.authToken = tok;
          return tok;
        }
      }
    } catch(e) {
      console.error("[SmartStatus] getAuthToken: Method 1 (getStore) Error:", e);
    }

    // Method 2: BdApi.Webpack.getModule with searchExports
    try {
      const tokenMod = BdApi.Webpack.getModule(m => m && m.getToken, { searchExports: true });
      if (tokenMod && typeof tokenMod.getToken === "function") {
        const tok = tokenMod.getToken();
        if (tok && typeof tok === "string" && tok.length > 30) {
          console.log("[SmartStatus] getAuthToken: Found token via BdApi.Webpack.getModule(m.getToken, { searchExports: true })");
          this.authToken = tok;
          return tok;
        }
      }
    } catch(e) {
      console.error("[SmartStatus] getAuthToken: Method 2 (getModule searchExports) Error:", e);
    }

    // Method 3: Safe traversal of all modules
    try {
      const allModules = BdApi.Webpack.getAllModules();
      for (const m of allModules) {
        if (!m) continue;
        // Check m directly
        try {
          if (m.getToken && typeof m.getToken === "function") {
            const tok = m.getToken();
            if (tok && typeof tok === "string" && tok.length > 30) {
              console.log("[SmartStatus] getAuthToken: Found token via Method 3 (direct module check)");
              this.authToken = tok;
              return tok;
            }
          }
        } catch(e) {}
        
        // Check m.default
        try {
          if (m.default && m.default.getToken && typeof m.default.getToken === "function") {
            const tok = m.default.getToken();
            if (tok && typeof tok === "string" && tok.length > 30) {
              console.log("[SmartStatus] getAuthToken: Found token via Method 3 (m.default check)");
              this.authToken = tok;
              return tok;
            }
          }
        } catch(e) {}

        // Check internal properties
        try {
          for (const key in m) {
            if (m[key] && m[key].getToken && typeof m[key].getToken === "function") {
              const tok = m[key].getToken();
              if (tok && typeof tok === "string" && tok.length > 30) {
                console.log("[SmartStatus] getAuthToken: Found token via Method 3 (m[" + key + "] check)");
                this.authToken = tok;
                return tok;
              }
            }
          }
        } catch(e) {}
      }
    } catch(e) {
      console.error("[SmartStatus] getAuthToken: Method 3 (getAllModules traversal) Error:", e);
    }

    // Method 4: iframe localStorage fallback
    try {
      let proxy = document.createElement("iframe");
      document.body.appendChild(proxy);
      let token = Object.assign({}, proxy.contentWindow).window.localStorage["token"];
      document.body.removeChild(proxy);
      if (token) {
        const cleanedToken = token.replace(/"/g, "");
        if (cleanedToken.length > 30) {
          console.log("[SmartStatus] getAuthToken: Found token via iframe fallback (length: " + cleanedToken.length + ")");
          this.authToken = cleanedToken;
          return cleanedToken;
        }
      }
    } catch(e) {
      console.error("[SmartStatus] getAuthToken: Method 4 (iframe) Error:", e);
    }

    console.warn("[SmartStatus] getAuthToken: WARNING: Failed to find auth token in any method!");
    return null;
  }

  setStatus(status) {
    console.log(`[SmartStatus] setStatus: requested status=${status}`);
    const token = this.getAuthToken();
    if (!token) {
      console.warn("[SmartStatus] setStatus: ABORTED - No auth token retrieved.");
      return;
    }

    if (this.currentStatus === status) {
      console.log(`[SmartStatus] setStatus: NO-OP - already at status=${status}`);
      return;
    }

    console.log(`[SmartStatus] setStatus: sending PATCH request for status=${status}`);
    this.currentStatus = status;

    const req = new XMLHttpRequest();
    req.open("PATCH", "/api/v9/users/@me/settings", true);
    req.setRequestHeader("authorization", token);
    req.setRequestHeader("content-type", "application/json");
    req.onload = () => {
      console.log(`[SmartStatus] setStatus: PATCH response status=${req.status}`);
      if (req.status >= 400) {
        console.error(`[SmartStatus] Error: ${req.status} - ${req.responseText}`);
      } else {
        console.log(`[SmartStatus] setStatus: status successfully set to ${status}`);
      }
    };
    req.onerror = (e) => {
      console.error("[SmartStatus] setStatus: request error:", e);
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
    this.lastActivityTime = Date.now();
    this.updateState();
  }

  async updateState() {
    if (this.idleTimer) clearTimeout(this.idleTimer);

    // Dynamic check of the document focus to prevent getting stuck in online status
    this.isFocused = document.hasFocus();

    let isIdle = false;
    let hasPowerMonitor = false;
    let systemIdleTime = 0;

    try {
      if (typeof window !== "undefined" && window.DiscordNative && window.DiscordNative.powerMonitor && typeof window.DiscordNative.powerMonitor.getSystemIdleTimeMs === "function") {
        const val = window.DiscordNative.powerMonitor.getSystemIdleTimeMs();
        const ms = (val instanceof Promise) ? await val : val;
        systemIdleTime = ms / 1000;
        hasPowerMonitor = true;
      } else {
        const electron = require("electron");
        if (electron && electron.powerMonitor) {
          systemIdleTime = electron.powerMonitor.getSystemIdleTime();
          hasPowerMonitor = true;
        }
      }
    } catch (e) {
      // powerMonitor not available
    }

    const idleDelaySeconds = (this.settings.idleDelay || 2) * 60;

    if (hasPowerMonitor) {
      if (systemIdleTime >= idleDelaySeconds) {
        isIdle = true;
      }
    } else {
      const timeSinceLastActivity = (Date.now() - this.lastActivityTime) / 1000;
      if (timeSinceLastActivity >= idleDelaySeconds) {
        isIdle = true;
      }
    }

    if (isIdle) {
      this.setStatus(this.settings.idleStatus);
    } else {
      if (this.isFocused) {
        this.setStatus(this.settings.activeStatus);
      } else {
        this.setStatus(this.settings.inactiveStatus);
      }
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
        option.style.backgroundColor = "#2b2d31";
        option.style.color = "#dbdee1";
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
