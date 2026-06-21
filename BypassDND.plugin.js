/**
 * @name BypassDND
 * @author senkih
 * @description Bypasses Do Not Disturb (DND) status locally so you still receive notifications.
 * @version 3.0.1
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
  }

  load() {
    const saved = BdApi.Data.load(this.meta.name, "settings") || {};
    this.settings = Object.assign({}, this.defaultSettings, saved);
  }

  start() {
    this.patchNotificationAndStatus();
  }

  stop() {
    BdApi.Patcher.unpatchAll(this.meta.name);
  }

  getCurrentUserId() {
    try {
      const UserStore = BdApi.Webpack.getStore("UserStore") || BdApi.Webpack.getModule(m => (m.getCurrentUser && m.getUser) || (m.default && m.default.getCurrentUser && m.default.getUser));
      const currentUser = UserStore?.getCurrentUser?.() || UserStore?.default?.getCurrentUser?.();
      return currentUser?.id || null;
    } catch(e) {}
    return null;
  }

  patchNotificationAndStatus() {
    let SelfPresenceStore = null;
    try {
      SelfPresenceStore = BdApi.Webpack.getStore("SelfPresenceStore") || BdApi.Webpack.getModule(m => {
        try {
          if (m && m.getName && m.getName() === "SelfPresenceStore") return true;
          if (m && m.default && m.default.getName && m.default.getName() === "SelfPresenceStore") return true;
        } catch(e) {}
        return false;
      });
    } catch(e) {
      console.error("[BypassDND] Failed to get SelfPresenceStore", e);
    }

    let UserStatusStore = null;
    try {
      UserStatusStore = BdApi.Webpack.getStore("UserStatusStore") || BdApi.Webpack.getModule(m => {
        try {
          if (m && m.getStatus && m.isMobileOnline) return true;
          if (m && m.default && m.default.getStatus && m.default.isMobileOnline) return true;
        } catch(e) {}
        return false;
      });
    } catch(e) {
      console.error("[BypassDND] Failed to get UserStatusStore", e);
    }

    let PresenceStore = null;
    try {
      PresenceStore = BdApi.Webpack.getStore("PresenceStore") || BdApi.Webpack.getModule(m => {
        try {
          if (m && m.getName && m.getName() === "PresenceStore") return true;
          if (m && m.default && m.default.getName && m.default.getName() === "PresenceStore") return true;
        } catch(e) {}
        return false;
      });
    } catch(e) {
      console.error("[BypassDND] Failed to get PresenceStore", e);
    }

    let NotificationCheckModule = null;
    try {
      NotificationCheckModule = BdApi.Webpack.getModule(m => {
        try {
          for (const key in m) {
            try {
              if (m[key] && typeof m[key] === "function") {
                const str = m[key].toString();
                if (str.includes("ignoreStatus") && str.includes("allowNoMessages") && str.includes("isLurking")) {
                  return true;
                }
              }
            } catch(e) {}
          }
        } catch(e) {}
        return false;
      });
    } catch(e) {
      console.error("[BypassDND] Failed to get NotificationCheckModule", e);
    }

    // 1. Patch local presence stores only if alwaysOnlineLocally is enabled
    if (this.settings.alwaysOnlineLocally) {
      const patchStore = (store, name) => {
        if (!store || typeof store.getStatus !== "function") return;
        try {
          BdApi.Patcher.instead(this.meta.name, store, "getStatus", (thisObject, args, originalMethod) => {
            const res = originalMethod.apply(thisObject, args);
            const isSelf = name === "SelfPresenceStore" || (args[0] && args[0] === this.getCurrentUserId());
            if (isSelf && (res === "dnd" || res === "idle")) {
              return "online";
            }
            return res;
          });
        } catch(e) {
          console.error(`[BypassDND] Error patching ${name}:`, e);
        }
      };

      patchStore(SelfPresenceStore, "SelfPresenceStore");
      patchStore(Object.getPrototypeOf(SelfPresenceStore), "SelfPresenceStore Prototype");
      if (SelfPresenceStore?.default) {
        patchStore(SelfPresenceStore.default, "SelfPresenceStore Default");
        patchStore(Object.getPrototypeOf(SelfPresenceStore.default), "SelfPresenceStore Default Prototype");
      }

      patchStore(UserStatusStore, "UserStatusStore");
      patchStore(Object.getPrototypeOf(UserStatusStore), "UserStatusStore Prototype");
      if (UserStatusStore?.default) {
        patchStore(UserStatusStore.default, "UserStatusStore Default");
        patchStore(Object.getPrototypeOf(UserStatusStore.default), "UserStatusStore Default Prototype");
      }

      patchStore(PresenceStore, "PresenceStore");
      patchStore(Object.getPrototypeOf(PresenceStore), "PresenceStore Prototype");
      if (PresenceStore?.default) {
        patchStore(PresenceStore.default, "PresenceStore Default");
        patchStore(Object.getPrototypeOf(PresenceStore.default), "PresenceStore Default Prototype");
      }
    }

    // 2. Patch NotificationCheckModule to bypass status constraints for notifications
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
          BdApi.Patcher.before(this.meta.name, NotificationCheckModule, notifyCheckKey, (thisObject, args) => {
            const currentStatus = SelfPresenceStore?.getStatus() || "online";
            const isDnd = currentStatus === "dnd";
            const isIdle = currentStatus === "idle";
            
            if ((isDnd && this.settings.bypassDnd) || (isIdle && this.settings.bypassIdle)) {
              if (!args[3]) {
                args[3] = {};
              }
              args[3].ignoreStatus = true;
            }
          });
        }
      } catch(err) {
        console.error("[BypassDND] Error patching NotificationCheckModule:", err);
      }
    }

    if (typeof BdApi !== "undefined" && BdApi.UI && typeof BdApi.UI.showToast === "function") {
      BdApi.UI.showToast("BypassDND запущен!", { type: "success" });
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
    }, "Обходить статус \"Не беспокоить\" (DND) для уведомлений"));

    // Setting 2: Bypass Idle
    container.appendChild(createCheckbox(this.settings.bypassIdle, (val) => {
      this.settings.bypassIdle = val;
      this.saveSettings();
    }, "Также обходить статус \"Неактивен\" (Idle) для уведомлений"));

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
