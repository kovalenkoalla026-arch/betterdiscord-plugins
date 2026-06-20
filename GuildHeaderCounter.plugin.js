/**
 * @name GuildHeaderCounter
 * @author Antigravity
 * @description \u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u043a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e \u0443\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u043e\u0432 \u0438 \u043e\u043d\u043b\u0430\u0439\u043d \u043f\u0440\u044f\u043c\u043e \u043f\u043e\u0434 \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435\u043c \u0441\u0435\u0440\u0432\u0435\u0440\u0430 \u0432 \u0441\u043f\u0438\u0441\u043a\u0435 \u043a\u0430\u043d\u0430\u043b\u043e\u0432 (\u0432 \u0448\u0430\u043f\u043a\u0435 \u0441\u0435\u0440\u0432\u0435\u0440\u0430).
 * @version 1.0.1
 * @invite Jx3TjNS
 */

module.exports = (_ => {
    const changeLog = {};

    return !window.BDFDB_Global || (!window.BDFDB_Global.loaded && !window.BDFDB_Global.started) ? class {
        constructor(meta) { for (let key in meta) this[key] = meta[key]; }
        getName() { return this.name; }
        getAuthor() { return this.author; }
        getVersion() { return this.version; }
        getDescription() { return `\u0414\u043b\u044f \u0440\u0430\u0431\u043e\u0442\u044b \u043f\u043b\u0430\u0433\u0438\u043d\u0430 \u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044f \u0431\u0438\u0431\u043b\u0438\u043e\u0442\u0435\u043a\u0430 BDFDB. \u041f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430, \u043d\u0430\u0436\u043c\u0438\u0442\u0435 "Download Now" \u0434\u043b\u044f \u0443\u0441\u0442\u0430\u043d\u043e\u0432\u043a\u0438.`; }
        
        downloadLibrary() {
            BdApi.Net.fetch("https://mwittrien.github.io/BetterDiscordAddons/Library/0BDFDB.plugin.js").then(r => {
                if (!r || r.status != 200) throw new Error();
                else return r.text();
            }).then(b => {
                if (!b) throw new Error();
                else return require("fs").writeFile(require("path").join(BdApi.Plugins.folder, "0BDFDB.plugin.js"), b, _ => BdApi.UI.showToast("Finished downloading BDFDB Library", {type: "success"}));
            }).catch(error => {
                BdApi.UI.alert("Error", "Could not download BDFDB Library Plugin. Try again later.");
            });
        }
        
        load() {
            if (!window.BDFDB_Global || !Array.isArray(window.BDFDB_Global.pluginQueue)) window.BDFDB_Global = Object.assign({}, window.BDFDB_Global, {pluginQueue: []});
            if (!window.BDFDB_Global.downloadModal) {
                window.BDFDB_Global.downloadModal = true;
                BdApi.UI.showConfirmationModal("Library Missing", `The Library Plugin needed for ${this.name} is missing. Please click "Download Now" to install it.`, {
                    confirmText: "Download Now",
                    cancelText: "Cancel",
                    onCancel: _ => { delete window.BDFDB_Global.downloadModal; },
                    onConfirm: _ => {
                        delete window.BDFDB_Global.downloadModal;
                        this.downloadLibrary();
                    }
                });
            }
            if (!window.BDFDB_Global.pluginQueue.includes(this.name)) window.BDFDB_Global.pluginQueue.push(this.name);
        }
        start() { this.load(); }
        stop() {}
    } : (([Plugin, BDFDB]) => {
        let Dispatcher;
        let subscribed = false;
        let activeGuildHeader = null;
        const onlineMemberCounts = new Map();
        
        function handleGuildMemberListUpdate({ guildId, groups }) {
            if (!groups) return;
            const onlineCount = groups.reduce((total, group) => {
                return group.id !== 'offline' ? total + group.count : total;
            }, 0);
            onlineMemberCounts.set(guildId, onlineCount);
            forceUpdateHeader();
        }
        
        function handleOnlineGuildMemberCountUpdate({ guildId, count }) {
            onlineMemberCounts.set(guildId, count);
            forceUpdateHeader();
        }
        
        function forceUpdateHeader() {
            if (activeGuildHeader && typeof activeGuildHeader.forceUpdate === "function") {
                try {
                    activeGuildHeader.forceUpdate();
                } catch (err) {}
            }
        }
        
        function initSubscribe() {
            if (!Dispatcher) Dispatcher = BdApi.Webpack.getModule(m => m.dispatch && m.subscribe, { searchExports: true }) || BdApi.Webpack.getByKeys("dispatch", "subscribe");
            if (Dispatcher && !subscribed) {
                Dispatcher.subscribe('GUILD_MEMBER_LIST_UPDATE', handleGuildMemberListUpdate);
                Dispatcher.subscribe('ONLINE_GUILD_MEMBER_COUNT_UPDATE', handleOnlineGuildMemberCountUpdate);
                subscribed = true;
            }
        }
        
        function unsubscribe() {
            if (Dispatcher && subscribed) {
                Dispatcher.unsubscribe('GUILD_MEMBER_LIST_UPDATE', handleGuildMemberListUpdate);
                Dispatcher.unsubscribe('ONLINE_GUILD_MEMBER_COUNT_UPDATE', handleOnlineGuildMemberCountUpdate);
                subscribed = false;
            }
        }

        const CSS_CONTENT = `
            .guild-header-counter-container {
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 12px;
                font-weight: 500;
                color: #949ba4;
                margin-top: 4px;
                line-height: 16px;
                user-select: none;
            }
            .guild-header-counter-item {
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .guild-header-counter-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                display: inline-block;
            }
            .guild-header-counter-dot.online {
                background-color: #23a55a;
            }
            .guild-header-counter-dot.total {
                background-color: #80848e;
            }
            .guild-header-counter-column {
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                justify-content: center;
                overflow: hidden;
                flex: 1;
            }
        `;

        return class GuildHeaderCounter extends Plugin {
            onLoad() {
                this.modulePatches = {
                    after: [
                        "GuildHeader"
                    ]
                };
            }
            
            onStart() {
                initSubscribe();
                
                if (BdApi.DOM && typeof BdApi.DOM.addStyle === "function") {
                    BdApi.DOM.addStyle("GuildHeaderCounterStyles", CSS_CONTENT);
                } else {
                    BdApi.injectCSS("GuildHeaderCounterStyles", CSS_CONTENT);
                }
                
                BDFDB.DiscordUtils.rerenderAll();
            }
            
            onStop() {
                unsubscribe();
                activeGuildHeader = null;
                
                if (BdApi.DOM && typeof BdApi.DOM.removeStyle === "function") {
                    BdApi.DOM.removeStyle("GuildHeaderCounterStyles");
                } else {
                    BdApi.clearCSS("GuildHeaderCounterStyles");
                }
                
                BDFDB.DiscordUtils.rerenderAll();
            }
            
            processGuildHeader(e) {
                const guild = e.instance.props.guild;
                if (!guild) return;
                
                activeGuildHeader = e.instance;
                
                const total = BDFDB.LibraryStores.GuildMemberCountStore.getMemberCount(guild.id) || guild.approximateMemberCount || 0;
                const online = onlineMemberCounts.get(guild.id) || guild.approximatePresenceCount || 0;
                
                if (total === 0) return;
                
                const findAndReplaceName = (node) => {
                    if (!node || typeof node !== "object") return false;
                    
                    let children = node.props && node.props.children;
                    if (!children) return false;
                    
                    if (Array.isArray(children)) {
                        for (let i = 0; i < children.length; i++) {
                            const child = children[i];
                            if (child && child.props && (child.props.children === guild.name || (Array.isArray(child.props.children) && child.props.children.includes(guild.name)) || (child.props.className && typeof child.props.className === "string" && child.props.className.includes("name")))) {
                                children[i] = BDFDB.ReactUtils.createElement("div", {
                                    className: "guild-header-counter-column",
                                    children: [
                                        child,
                                        BDFDB.ReactUtils.createElement("div", {
                                            className: "guild-header-counter-container",
                                            children: [
                                                BDFDB.ReactUtils.createElement("div", {
                                                    className: "guild-header-counter-item",
                                                    children: [
                                                        BDFDB.ReactUtils.createElement("span", { className: "guild-header-counter-dot online" }),
                                                        BDFDB.ReactUtils.createElement("span", {}, `${online.toLocaleString()}`)
                                                    ]
                                                }),
                                                BDFDB.ReactUtils.createElement("div", {
                                                    className: "guild-header-counter-item",
                                                    children: [
                                                        BDFDB.ReactUtils.createElement("span", { className: "guild-header-counter-dot total" }),
                                                        BDFDB.ReactUtils.createElement("span", {}, `${total.toLocaleString()}`)
                                                    ]
                                                })
                                            ]
                                        })
                                    ]
                                });
                                return true;
                            }
                            if (findAndReplaceName(child)) return true;
                        }
                    } else if (typeof children === "object") {
                        const child = children;
                        if (child && child.props && (child.props.children === guild.name || (Array.isArray(child.props.children) && child.props.children.includes(guild.name)) || (child.props.className && typeof child.props.className === "string" && child.props.className.includes("name")))) {
                            node.props.children = BDFDB.ReactUtils.createElement("div", {
                                className: "guild-header-counter-column",
                                children: [
                                    child,
                                    BDFDB.ReactUtils.createElement("div", {
                                        className: "guild-header-counter-container",
                                        children: [
                                            BDFDB.ReactUtils.createElement("div", {
                                                className: "guild-header-counter-item",
                                                children: [
                                                    BDFDB.ReactUtils.createElement("span", { className: "guild-header-counter-dot online" }),
                                                    BDFDB.ReactUtils.createElement("span", {}, `${online.toLocaleString()}`)
                                                ]
                                            }),
                                            BDFDB.ReactUtils.createElement("div", {
                                                className: "guild-header-counter-item",
                                                children: [
                                                    BDFDB.ReactUtils.createElement("span", { className: "guild-header-counter-dot total" }),
                                                    BDFDB.ReactUtils.createElement("span", {}, `${total.toLocaleString()}`)
                                                ]
                                            })
                                        ]
                                    })
                                ]
                            });
                            return true;
                        }
                        return findAndReplaceName(child);
                    }
                    return false;
                };
                
                if (typeof e.returnvalue === "function") {
                    const originalRender = e.returnvalue;
                    e.returnvalue = function (...args) {
                        const rendered = originalRender.apply(this, args);
                        findAndReplaceName(rendered);
                        return rendered;
                    };
                } else {
                    findAndReplaceName(e.returnvalue);
                }
            }
        };
    })(window.BDFDB_Global.PluginUtils.buildPlugin(changeLog));
})();
Pressing key...Clicking...Stopping...

Stop Agent
