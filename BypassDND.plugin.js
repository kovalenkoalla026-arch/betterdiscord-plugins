/**
 * @name BypassDND
 * @author senkih
 * @description Bypasses Do Not Disturb (DND) status locally so you still receive notifications and incoming calls.
 * @version 2.3.3
 * @website https://github.com/kovalenkoalla026-arch/betterdiscord-plugins
 * @source https://github.com/kovalenkoalla026-arch/betterdiscord-plugins/blob/main/BypassDND.plugin.js
 */

class BypassDND {
  constructor(meta) {
    this.meta = meta;
    this.defaultSettings = {
      bypassDnd: true,
      bypassIdle: false,
      alwaysOnlineLocally: false
    };
    this.settings = {};
    this.cachedCurrentUserId = null;
    this.syncCallbackNames = ["R", "O"];
  }

  load() {
    const saved = BdApi.Data.load(this.meta.name, "settings") || {};
    this.settings = Object.assign({}, this.defaultSettings, saved);
    this.saveSettings();
    console.log(`[${this.meta.name}] Loaded settings:`, JSON.stringify(this.settings));
  }

  start() {
    const fs = require("fs");
    const logFile = "C:\\Users\\Senk\\.gemini\\antigravity-ide\\scratch\\bypass_dnd_debug.txt";
    const logs = [];
    const log = (msg) => {
      logs.push(`[${new Date().toISOString()}] ${msg}`);
      try {
        if (logs.length > 500) {
          logs.shift();
        }
        fs.writeFileSync(logFile, logs.join("\n") + "\n", "utf8");
      } catch(e) {}
    };

    try {
      log("1. Start called");
      this.findSyncCallbackNames(log);
      log("2. Calling patchStatusAndNotificationModules");
      this.patchStatusAndNotificationModules(log);
      log("3. Finished patchStatusAndNotificationModules");
    } catch(e) {
      log("CRITICAL START ERROR: " + e.stack);
    }
  }

  stop() {
    BdApi.Patcher.unpatchAll(this.meta.name);
  }

  findSyncCallbackNames(log) {
    try {
      const IncomingCallStore = BdApi.Webpack.getStore("IncomingCallStore");
      if (!IncomingCallStore) return;
      
      const modules = BdApi.Webpack.getModule(() => true, { first: false }) || [];
      modules.forEach(m => {
        const checkStore = (s) => {
          if (s && s._syncWiths && Array.isArray(s._syncWiths)) {
            s._syncWiths.forEach((sw) => {
              if (sw.store === IncomingCallStore && sw.func && sw.func.name) {
                log(`Found sync callback name: ${sw.func.name} in store ${s.getName ? s.getName() : "Unknown"}`);
                this.syncCallbackNames.push(sw.func.name);
              }
            });
          }
        };
        if (m && m.getName && typeof m.getName === "function") {
          checkStore(m);
        } else if (m && m.default && m.default.getName && typeof m.default.getName === "function") {
          checkStore(m.default);
        }
      });
      // Deduplicate
      this.syncCallbackNames = Array.from(new Set(this.syncCallbackNames));
      log("Final sync callback names: " + JSON.stringify(this.syncCallbackNames));
    } catch(err) {
      log("Error finding sync callback names: " + err.stack);
    }
  }

  showToast(message, options) {
    if (typeof BdApi !== "undefined" && BdApi.UI && typeof BdApi.UI.showToast === "function") {
      BdApi.UI.showToast(message, options);
    } else if (typeof BdApi !== "undefined" && typeof BdApi.showToast === "function") {
      BdApi.showToast(message, options);
    } else {
      console.log(`[${this.meta.name}] Toast:`, message, options);
    }
  }

  getCurrentUserId() {
    if (this.cachedCurrentUserId) return this.cachedCurrentUserId;
    try {
      const UserStore = BdApi.Webpack.getStore("UserStore") || BdApi.Webpack.getModule(m => (m.getCurrentUser && m.getUser) || (m.default && m.default.getCurrentUser && m.default.getUser));
      const currentUser = UserStore?.getCurrentUser?.() || UserStore?.default?.getCurrentUser?.();
      if (currentUser) {
        this.cachedCurrentUserId = currentUser.id;
        return this.cachedCurrentUserId;
      }
    } catch(e) {}
    return null;
  }

  patchStatusAndNotificationModules(log) {
    log("a. Entering patchStatusAndNotificationModules");
    
    let SelfPresenceStore = null;
    try {
      log("b. Fetching SelfPresenceStore");
      SelfPresenceStore = BdApi.Webpack.getStore("SelfPresenceStore") || BdApi.Webpack.getModule(m => m.getName && m.getName() === "SelfPresenceStore" || (m.default && m.default.getName && m.default.getName() === "SelfPresenceStore"));
      log("c. Fetched SelfPresenceStore: " + !!SelfPresenceStore);
    } catch(e) {
      log("Error fetching SelfPresenceStore: " + e.stack);
    }

    let UserStatusStore = null;
    try {
      log("d. Fetching UserStatusStore");
      UserStatusStore = BdApi.Webpack.getStore("UserStatusStore") || BdApi.Webpack.getModule(m => (m.getStatus && m.isMobileOnline) || (m.default && m.default.getStatus && m.default.isMobileOnline));
      log("e. Fetched UserStatusStore: " + !!UserStatusStore);
    } catch(e) {
      log("Error fetching UserStatusStore: " + e.stack);
    }

    let PresenceStore = null;
    try {
      log("f. Fetching PresenceStore");
      PresenceStore = BdApi.Webpack.getStore("PresenceStore") || BdApi.Webpack.getModule(m => m.getName && m.getName() === "PresenceStore" || (m.default && m.default.getName && m.default.getName() === "PresenceStore"));
      log("g. Fetched PresenceStore: " + !!PresenceStore);
    } catch(e) {
      log("Error fetching PresenceStore: " + e.stack);
    }

    let NotificationCheckModule = null;
    try {
      log("h. Fetching NotificationCheckModule");
      NotificationCheckModule = BdApi.Webpack.getModule(m => {
        for (const key in m) {
          if (typeof m[key] === "function") {
            const str = m[key].toString();
            if (str.includes("ignoreStatus") && str.includes("allowNoMessages") && str.includes("isLurking")) {
              return true;
            }
          }
        }
        return false;
      });
      log("i. Fetched NotificationCheckModule: " + !!NotificationCheckModule);
    } catch(e) {
      log("Error fetching NotificationCheckModule: " + e.stack);
    }

    let lastDiagLog = 0;
    const isCallRinging = () => {
      try {
        const IncomingCallStore = BdApi.Webpack.getStore("IncomingCallStore");
        const CallStore = BdApi.Webpack.getStore("CallStore");

        const hasInc = IncomingCallStore && typeof IncomingCallStore.hasIncomingCalls === "function" ? IncomingCallStore.hasIncomingCalls() : false;
        const incCalls = IncomingCallStore && typeof IncomingCallStore.getIncomingCalls === "function" ? IncomingCallStore.getIncomingCalls() : null;
        const rawCalls = CallStore && typeof CallStore.getCalls === "function" ? CallStore.getCalls() : null;

        const now = Date.now();
        if (now - lastDiagLog > 3000 || hasInc || (rawCalls && Object.keys(rawCalls).length > 0)) {
          lastDiagLog = now;
          log(`isCallRinging DIAG: hasIncomingCalls = ${hasInc}, getIncomingCalls = ${JSON.stringify(incCalls)}, getCalls = ${JSON.stringify(rawCalls)}`);
        }

        if (hasInc) {
          log("isCallRinging: IncomingCallStore has incoming calls");
          return true;
        }
        
        if (rawCalls) {
          const callsList = Array.isArray(rawCalls) ? rawCalls : Object.values(rawCalls);
          if (callsList.length > 0) {
            log("isCallRinging: CallStore has active/ringing call");
            return true;
          }
        }
      } catch(e) {
        log("isCallRinging error: " + e.stack);
      }
      return false;
    };

    const shouldBypass = (res, args, source) => {
      const isDnd = res === "dnd";
      const isIdle = res === "idle";
      
      if (isDnd || isIdle) {
        if ((isDnd && this.settings.bypassDnd) || (isIdle && this.settings.bypassIdle)) {
          if (this.settings.alwaysOnlineLocally) {
            return true;
          }
          
          if (isCallRinging()) {
            return true;
          }
          
          const stack = new Error().stack || "";
          let isBackground = 
            stack.includes("MESSAGE_CREATE") ||
            stack.includes("CALL_CREATE") ||
            stack.includes("VOICE_STATE_UPDATE") ||
            stack.includes("CALL_UPDATE") ||
            stack.includes("RING") ||
            stack.includes("playSound") ||
            stack.includes("PlaySound") ||
            stack.includes("Sound") ||
            stack.includes("Notification") ||
            stack.includes("IncomingCallStore") ||
            stack.includes("syncWith");

          if (!isBackground) {
            for (const name of this.syncCallbackNames) {
              const regex = new RegExp(`\\bat ${name}\\b`);
              if (regex.test(stack)) {
                isBackground = true;
                break;
              }
            }
          }

          if (isBackground) {
            return true;
          }
        }
      }
      return false;
    };

    // Patch SelfPresenceStore getStatus
    if (SelfPresenceStore) {
      const patchSelfPresenceStatus = (target, name) => {
        if (!target || typeof target.getStatus !== "function") return;
        log(`Patching SelfPresenceStore getStatus on ${name}`);
        try {
          BdApi.Patcher.instead(this.meta.name, target, "getStatus", (thisObject, args, originalMethod) => {
            const res = originalMethod.apply(thisObject, args);
            if (shouldBypass(res, args, `SelfPresenceStore (${name})`)) {
              return "online";
            }
            return res;
          });
        } catch(err) {
          log(`Error patching SelfPresenceStore ${name}: ` + err.stack);
        }
      };

      patchSelfPresenceStatus(SelfPresenceStore, "Store");
      patchSelfPresenceStatus(Object.getPrototypeOf(SelfPresenceStore), "Prototype");
      if (SelfPresenceStore.default) {
        patchSelfPresenceStatus(SelfPresenceStore.default, "Default");
        patchSelfPresenceStatus(Object.getPrototypeOf(SelfPresenceStore.default), "Default Prototype");
      }
    }

    // Patch UserStatusStore getStatus
    if (UserStatusStore) {
      const patchUserStatus = (target, name) => {
        if (!target || typeof target.getStatus !== "function") return;
        log(`Patching UserStatusStore getStatus on ${name}`);
        try {
          BdApi.Patcher.instead(this.meta.name, target, "getStatus", (thisObject, args, originalMethod) => {
            const res = originalMethod.apply(thisObject, args);
            const userId = args[0];
            const currentUserId = this.getCurrentUserId();
            
            if (userId && currentUserId && userId === currentUserId) {
              if (shouldBypass(res, args, `UserStatusStore (${name})`)) {
                return "online";
              }
            }
            return res;
          });
        } catch(err) {
          log(`Error patching UserStatusStore ${name}: ` + err.stack);
        }
      };

      patchUserStatus(UserStatusStore, "Store");
      patchUserStatus(Object.getPrototypeOf(UserStatusStore), "Prototype");
      if (UserStatusStore.default) {
        patchUserStatus(UserStatusStore.default, "Default");
        patchUserStatus(Object.getPrototypeOf(UserStatusStore.default), "Default Prototype");
      }
    }

    // Patch PresenceStore getStatus
    if (PresenceStore) {
      const patchPresenceStatus = (target, name) => {
        if (!target || typeof target.getStatus !== "function") return;
        log(`Patching PresenceStore getStatus on ${name}`);
        try {
          BdApi.Patcher.instead(this.meta.name, target, "getStatus", (thisObject, args, originalMethod) => {
            const res = originalMethod.apply(thisObject, args);
            const userId = args[0];
            const currentUserId = this.getCurrentUserId();
            
            if (userId && currentUserId && userId === currentUserId) {
              if (shouldBypass(res, args, `PresenceStore (${name})`)) {
                return "online";
              }
            }
            return res;
          });
        } catch(err) {
          log(`Error patching PresenceStore ${name}: ` + err.stack);
        }
      };

      patchPresenceStatus(PresenceStore, "Store");
      patchPresenceStatus(Object.getPrototypeOf(PresenceStore), "Prototype");
      if (PresenceStore.default) {
        patchPresenceStatus(PresenceStore.default, "Default");
        patchPresenceStatus(Object.getPrototypeOf(PresenceStore.default), "Default Prototype");
      }
    }

    // Patch Notification Check Module
    if (NotificationCheckModule) {
      try {
        let notifyCheckKey = null;
        for (const key in NotificationCheckModule) {
          if (typeof NotificationCheckModule[key] === "function") {
            const str = NotificationCheckModule[key].toString();
            if (str.includes("ignoreStatus") && str.includes("allowNoMessages") && str.includes("isLurking")) {
              notifyCheckKey = key;
              break;
            }
          }
        }

        if (notifyCheckKey) {
          log(`Patching NotificationCheckModule key: ${notifyCheckKey}`);
          BdApi.Patcher.before(this.meta.name, NotificationCheckModule, notifyCheckKey, (thisObject, args) => {
            if (!args[3]) {
              args[3] = {};
            }
            args[3].ignoreStatus = true;
          });
        }
      } catch(err) {
        log(`Error patching NotificationCheckModule: ` + err.stack);
      }
    }

    this.showToast(`BypassDND запущен!`, { type: "success" });
  }

  getSettingsPanel() {
    const container = document.createElement("div");
    container.style.padding = "15px";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "15px";

    const createLabel = (text) => {
      const el = document.createElement("h5");
      el.className = "bd-settings-title bd-settings-group-title";
      el.innerText = text;
      el.style.color = "var(--text-normal)";
      el.style.fontSize = "14px";
      el.style.fontWeight = "600";
      return el;
    };

    const createCheckbox = (checked, onChange, descriptionText) => {
      const wrapper = document.createElement("div");
      wrapper.style.display = "flex";
      wrapper.style.alignItems = "center";
      wrapper.style.gap = "10px";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = checked;
      checkbox.style.width = "20px";
      checkbox.style.height = "20px";
      checkbox.style.cursor = "pointer";
      checkbox.onchange = (e) => onChange(e.target.checked);

      const label = document.createElement("span");
      label.innerText = descriptionText;
      label.style.color = "var(--text-normal)";
      label.style.fontSize = "13px";

      wrapper.appendChild(checkbox);
      wrapper.appendChild(label);
      return wrapper;
    };

    // Setting 1: Bypass DND
    container.appendChild(createLabel("Настройки обхода:"));
    container.appendChild(createCheckbox(this.settings.bypassDnd, (val) => {
      this.settings.bypassDnd = val;
      this.saveSettings();
    }, "Обходить статус \"Не беспокоить\" (DND)"));

    // Setting 2: Bypass Idle
    container.appendChild(createCheckbox(this.settings.bypassIdle, (val) => {
      this.settings.bypassIdle = val;
      this.saveSettings();
    }, "Также обходить статус \"Неактивен\" (Idle) для звуков"));

    // Setting 3: Always Online Locally
    container.appendChild(createCheckbox(this.settings.alwaysOnlineLocally, (val) => {
      this.settings.alwaysOnlineLocally = val;
      this.saveSettings();
    }, "Локально всегда показывать Онлайн (зеленый кружок) на вашем экране (не рекомендуется, скрывает реальный цвет вашего статуса)"));

    return container;
  }

  saveSettings() {
    BdApi.Data.save(this.meta.name, "settings", this.settings);
    BdApi.Patcher.unpatchAll(this.meta.name);
    this.start();
  }
}

module.exports = BypassDND;
