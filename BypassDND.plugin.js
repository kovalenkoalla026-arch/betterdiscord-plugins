/**
 * @name BypassDND
 * @author senkih
 * @description Bypasses Do Not Disturb (DND) status locally so you still receive notifications and incoming calls.
 * @version 2.1.0
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
  }

  load() {
    const saved = BdApi.Data.load(this.meta.name, "settings") || {};
    this.settings = Object.assign({}, this.defaultSettings, saved);
    this.saveSettings();
    console.log(`[${this.meta.name}] Loaded settings:`, JSON.stringify(this.settings));
  }

  start() {
    this.patchStatusAndNotificationModules();
  }

  stop() {
    BdApi.Patcher.unpatchAll(this.meta.name);
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
      const UserStore = BdApi.Webpack.getModule(m => (m.getCurrentUser && m.getUser) || (m.default && m.default.getCurrentUser && m.default.getUser));
      const currentUser = UserStore?.getCurrentUser?.() || UserStore?.default?.getCurrentUser?.();
      if (currentUser) {
        this.cachedCurrentUserId = currentUser.id;
        return this.cachedCurrentUserId;
      }
    } catch(e) {
      console.error(`[${this.meta.name}] Error getting current user ID:`, e);
    }
    return null;
  }

  patchStatusAndNotificationModules() {
    try {
      // 1. Resolve webpack modules using BdApi.Webpack
      let SelfPresenceStore = BdApi.Webpack.getModule(m => m.getName && m.getName() === "SelfPresenceStore" || (m.default && m.default.getName && m.default.getName() === "SelfPresenceStore"));
      let UserStatusStore = BdApi.Webpack.getModule(m => (m.getStatus && m.isMobileOnline) || (m.default && m.default.getStatus && m.default.isMobileOnline));
      let NotificationCheckModule = BdApi.Webpack.getModule(m => {
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

      const shouldBypass = (res) => {
        const isDnd = res === "dnd";
        const isIdle = res === "idle";
        
        if ((isDnd && this.settings.bypassDnd) || (isIdle && this.settings.bypassIdle)) {
          if (this.settings.alwaysOnlineLocally) {
            return true;
          }
          
          const stack = new Error().stack || "";
          const isBackground = 
            stack.includes("MESSAGE_CREATE") ||
            stack.includes("CALL_CREATE") ||
            stack.includes("VOICE_STATE_UPDATE") ||
            stack.includes("CALL_UPDATE") ||
            stack.includes("RING") ||
            stack.includes("playSound") ||
            stack.includes("PlaySound") ||
            stack.includes("Sound") ||
            stack.includes("Notification");

          if (isBackground) {
            return true;
          }
        }
        return false;
      };

      // 2. Patch SelfPresenceStore getStatus
      if (SelfPresenceStore) {
        const patchSelfPresenceStatus = (target) => {
          if (!target || typeof target.getStatus !== "function") return;
          BdApi.Patcher.instead(this.meta.name, target, "getStatus", (thisObject, args, originalMethod) => {
            const res = originalMethod.apply(thisObject, args);
            if (shouldBypass(res)) {
              return "online";
            }
            return res;
          });
        };

        patchSelfPresenceStatus(SelfPresenceStore);
        patchSelfPresenceStatus(Object.getPrototypeOf(SelfPresenceStore));
        if (SelfPresenceStore.default) {
          patchSelfPresenceStatus(SelfPresenceStore.default);
          patchSelfPresenceStatus(Object.getPrototypeOf(SelfPresenceStore.default));
        }
        console.log("[BypassDND] SelfPresenceStore patch applied.");
      } else {
        console.error("[BypassDND] SelfPresenceStore not found!");
      }

      // 3. Patch UserStatusStore getStatus
      if (UserStatusStore) {
        const patchUserStatus = (target) => {
          if (!target || typeof target.getStatus !== "function") return;
          BdApi.Patcher.instead(this.meta.name, target, "getStatus", (thisObject, args, originalMethod) => {
            const res = originalMethod.apply(thisObject, args);
            const userId = args[0];
            const currentUserId = this.getCurrentUserId();
            
            if (userId && currentUserId && userId === currentUserId) {
              if (shouldBypass(res)) {
                return "online";
              }
            }
            return res;
          });
        };

        patchUserStatus(UserStatusStore);
        patchUserStatus(Object.getPrototypeOf(UserStatusStore));
        if (UserStatusStore.default) {
          patchUserStatus(UserStatusStore.default);
          patchUserStatus(Object.getPrototypeOf(UserStatusStore.default));
        }
        console.log("[BypassDND] UserStatusStore patch applied.");
      } else {
        console.error("[BypassDND] UserStatusStore not found!");
      }

      // 4. Patch Notification Check Module
      if (NotificationCheckModule) {
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
          BdApi.Patcher.before(this.meta.name, NotificationCheckModule, notifyCheckKey, (thisObject, args) => {
            // args[3] is options object
            if (!args[3]) {
              args[3] = {};
            }
            args[3].ignoreStatus = true;
          });
          console.log("[BypassDND] Notification check function patched.");
        } else {
          console.error("[BypassDND] Notification check key not found in module!");
        }
      } else {
        console.error("[BypassDND] NotificationCheckModule not found!");
      }

      this.showToast(`BypassDND успешно запущен и работает!`, { type: "success" });
    } catch (e) {
      console.error(`[${this.meta.name}] Start error:`, e);
      this.showToast(`Критическая ошибка при запуске.`, { type: "error" });
    }
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
