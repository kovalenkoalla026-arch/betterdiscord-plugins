/**
 * @name ServerInfo
 * @description Показывает подробную информацию о сервере (профиль сервера) в красивом всплывающем окне в стиле Vencord.
 * @version 1.0.8
 * @author Antigravity
 * @website https://github.com/vencord/discord-plugins
 */

let UserStore, RelationshipStore, PresenceStore, GuildMemberStore, GuildChannelStore, GuildRoleStore, FluxDispatcher, UserProfileUtils;

// React elements
const React = BdApi.React || window.React;
const ReactDOM = BdApi.ReactDOM || BdApi.Webpack.getByKeys("render", "findDOMNode") || window.ReactDOM;
const h = React.createElement;

function initModules() {
    try {
        UserStore = BdApi.Webpack.getStore("UserStore") || BdApi.Webpack.getByKeys("getUser", "getCurrentUser");
        RelationshipStore = BdApi.Webpack.getStore("RelationshipStore") || BdApi.Webpack.getByKeys("getFriendIDs", "getBlockedIDs");
        PresenceStore = BdApi.Webpack.getStore("PresenceStore") || BdApi.Webpack.getByKeys("getStatus");
        GuildMemberStore = BdApi.Webpack.getStore("GuildMemberStore") || BdApi.Webpack.getByKeys("getMember", "isMember");
        GuildChannelStore = BdApi.Webpack.getStore("GuildChannelStore") || BdApi.Webpack.getByKeys("getChannels");
        GuildRoleStore = BdApi.Webpack.getStore("GuildRoleStore") || BdApi.Webpack.getByKeys("getSortedRoles", "getRoles");
        FluxDispatcher = BdApi.Webpack.getModule(m => m.dispatch && m.subscribe, { searchExports: true }) || BdApi.Webpack.getByKeys("dispatch", "subscribe");
        UserProfileUtils = BdApi.Webpack.getModule(m => m.getUser && m.fetchProfile) || BdApi.Webpack.getByKeys("getUser", "fetchProfile");
        console.log("[ServerInfo] Webpack modules initialized successfully.");
    } catch (e) {
        console.error("[ServerInfo] Error initializing modules", e);
    }
}

// React 17/18 compatible renderer
function renderElement(element, container) {
    if (!ReactDOM) {
        throw new Error("ReactDOM не найден в системе.");
    }
    
    if (typeof ReactDOM.createRoot === "function") {
        // React 18+ style
        const root = ReactDOM.createRoot(container);
        root.render(element);
        container._reactRoot = root;
    } else if (typeof ReactDOM.render === "function") {
        // React 17 style
        ReactDOM.render(element, container);
    } else {
        throw new Error("Не найден подходящий метод рендеринга (render / createRoot).");
    }
}

function unmountElement(container) {
    if (!container) return;
    try {
        if (container._reactRoot && typeof container._reactRoot.unmount === "function") {
            // React 18+ unmount
            container._reactRoot.unmount();
            delete container._reactRoot;
        } else if (ReactDOM && typeof ReactDOM.unmountComponentAtNode === "function") {
            // React 17 unmount
            ReactDOM.unmountComponentAtNode(container);
        }
    } catch (e) {
        console.error("[ServerInfo] Error unmounting component", e);
    }
}

async function fetchUser(userId) {
    if (!userId) return null;
    if (UserStore) {
        const cached = UserStore.getUser(userId);
        if (cached) return cached;
    }
    
    // Try UserProfileUtils
    if (UserProfileUtils && typeof UserProfileUtils.getUser === "function") {
        try {
            const user = await UserProfileUtils.getUser(userId);
            if (user) return user;
        } catch (e) {}
    }
    
    // Try fetchProfile
    try {
        const profileActions = BdApi.Webpack.getByKeys("fetchProfile");
        if (profileActions && typeof profileActions.fetchProfile === "function") {
            await profileActions.fetchProfile(userId);
            if (UserStore) return UserStore.getUser(userId);
        }
    } catch (e) {}
    
    return null;
}

function openProfile(userId, guildId) {
    try {
        const UserProfileActions = BdApi.Webpack.getByKeys("openUserProfileModal") 
            || BdApi.Webpack.getByKeys("openUserProfile")
            || BdApi.Webpack.getModule(m => m.openUserProfileModal || m.openUserProfile);

        if (UserProfileActions) {
            if (typeof UserProfileActions.openUserProfileModal === "function") {
                try {
                    UserProfileActions.openUserProfileModal({ userId: userId, guildId: guildId });
                    return;
                } catch (e) {
                    try {
                        UserProfileActions.openUserProfileModal(userId);
                        return;
                    } catch (e2) {}
                }
            }
            if (typeof UserProfileActions.openUserProfile === "function") {
                try {
                    UserProfileActions.openUserProfile({ userId: userId, guildId: guildId });
                    return;
                } catch (e) {
                    try {
                        UserProfileActions.openUserProfile(userId);
                        return;
                    } catch (e2) {}
                }
            }
        }

        // Fallback to general modal open
        const UserProfileModal = BdApi.Webpack.getModule(m => m.open && m.close && m.open.toString().includes("USER_PROFILE_MODAL"))
            || BdApi.Webpack.getByKeys("open", "close");
        if (UserProfileModal && typeof UserProfileModal.open === "function") {
            try {
                UserProfileModal.open(userId);
                return;
            } catch (e) {}
        }

        if (FluxDispatcher) {
            try {
                FluxDispatcher.dispatch({
                    type: "USER_PROFILE_OPEN",
                    userId: userId
                });
                return;
            } catch (e) {}
            try {
                FluxDispatcher.dispatch({
                    type: "USER_PROFILE_MODAL_OPEN",
                    userId: userId
                });
                return;
            } catch (e) {}
        }
    } catch (e) {
        console.error("[ServerInfo] Error opening user profile", e);
    }
}

function getUserAvatarURL(user, size = 512) {
    if (!user) return "";
    try {
        const isAnimated = user.avatar && user.avatar.startsWith("a_");
        return user.avatar 
            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${isAnimated ? "gif" : "png"}?size=${size}`
            : `https://cdn.discordapp.com/embed/avatars/${user.discriminator === "0" ? (BigInt(user.id) >> 22n) % 6n : parseInt(user.discriminator) % 5}.png`;
    } catch (e) {
        return "";
    }
}

function getMemberAvatarURL(guildId, userId, member, user, size = 512) {
    try {
        const avatar = member?.avatar;
        if (avatar) {
            const isAnimated = avatar.startsWith("a_");
            return `https://cdn.discordapp.com/guilds/${guildId}/users/${userId}/avatars/${avatar}.${isAnimated ? "gif" : "png"}?size=${size}`;
        }
    } catch (e) {}
    return getUserAvatarURL(user, size);
}

// Acronym generator
function getGuildAcronym(guild) {
    if (!guild || !guild.name) return "";
    try {
        return guild.name
            .split(/\s+/)
            .map(word => word.charAt(0))
            .join("")
            .substring(0, 5)
            .toUpperCase();
    } catch (e) {
        return "";
    }
}

function formatTimestamp(timestamp) {
    if (!timestamp) return "-";
    try {
        const date = new Date(timestamp);
        return date.toLocaleDateString("ru-RU", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    } catch (e) {
        return "-";
    }
}

function getChannelsCount(guildId) {
    if (!GuildChannelStore) return "?";
    try {
        const channelsObj = GuildChannelStore.getChannels(guildId);
        if (!channelsObj) return "?";
        if (typeof channelsObj.count === "number") return channelsObj.count;
        if (channelsObj.SELECTABLE) return channelsObj.SELECTABLE.length + (channelsObj.VOCAL ? channelsObj.VOCAL.length : 0);
        if (Array.isArray(channelsObj)) return channelsObj.length;
        if (typeof channelsObj === "object") {
            return Object.keys(channelsObj).length;
        }
    } catch (e) {
        console.error("[ServerInfo] Error getting channel count", e);
    }
    return "?";
}

function getRolesCount(guildId) {
    if (!GuildRoleStore) return "?";
    try {
        const roles = GuildRoleStore.getSortedRoles ? GuildRoleStore.getSortedRoles(guildId) : GuildRoleStore.getRoles ? GuildRoleStore.getRoles(guildId) : null;
        if (!roles) return "?";
        if (Array.isArray(roles)) return Math.max(0, roles.length - 1);
        if (typeof roles === "object") {
            return Math.max(0, Object.keys(roles).length - 1);
        }
    } catch (e) {
        console.error("[ServerInfo] Error getting roles count", e);
    }
    return "?";
}

// Stack-overflow safe react tree finder (doesn't search non-React properties like guild objects)
const findInReactTree = (tree, filter) => {
    if (!tree || typeof tree !== "object") return null;
    if (filter(tree)) return tree;
    
    if (Array.isArray(tree)) {
        for (const child of tree) {
            if (child) {
                const res = findInReactTree(child, filter);
                if (res) return res;
            }
        }
    } else if (tree.props) {
        if (tree.props.children) {
            const res = findInReactTree(tree.props.children, filter);
            if (res) return res;
        }
    }
    return null;
};

function StatusIcon({ status }) {
    if (status === "online") {
        return h("svg", {
            width: "14",
            height: "14",
            viewBox: "0 0 16 16",
            className: "server-info-status-svg"
        }, h("circle", { cx: "8", cy: "8", r: "8", fill: "#23a55a" }));
    }
    if (status === "idle") {
        return h("svg", {
            width: "14",
            height: "14",
            viewBox: "0 0 16 16",
            className: "server-info-status-svg"
        }, h("path", {
            d: "M14.8 11.23a6 6 0 1 1-3.85-10.45 7.5 7.5 0 0 0 3.85 10.45z",
            fill: "#f0b232"
        }));
    }
    if (status === "dnd") {
        return h("svg", {
            width: "14",
            height: "14",
            viewBox: "0 0 16 16",
            className: "server-info-status-svg"
        }, h("path", {
            d: "M8 0a8 8 0 1 0 8 8 8 8 0 0 0-8-8zm4 9.5H4v-3h8z",
            fill: "#f23f43"
        }));
    }
    // offline / invisible
    return h("svg", {
        width: "14",
        height: "14",
        viewBox: "0 0 16 16",
        className: "server-info-status-svg"
    }, h("path", {
        d: "M8 0a8 8 0 1 0 8 8 8 8 0 0 0-8-8zm0 13a5 5 0 1 1 5-5 5 5 0 0 1-5 5z",
        fill: "#80848e"
    }));
}

function UserRow({ id, guildId, onClick }) {
    const [, forceUpdate] = React.useState({});
    const user = UserStore ? UserStore.getUser(id) : null;
    const presence = PresenceStore ? PresenceStore.getStatus(id) : "offline";
    const member = GuildMemberStore ? GuildMemberStore.getMember(guildId, id) : null;
    
    React.useEffect(() => {
        if (!user) {
            fetchUser(id).then(() => {
                forceUpdate({});
            });
        }
    }, [id, user]);
    
    if (!user) {
        return h("div", { className: "server-info-row" },
            h("div", { className: "server-info-avatar-wrapper" },
                h("div", { className: "server-info-avatar server-info-avatar-placeholder" }),
                h(StatusIcon, { status: "offline" })
            ),
            h("div", { className: "server-info-row-names" },
                h("span", { className: "server-info-row-display" }, "Загрузка...")
            )
        );
    }
    
    const avatarUrl = getMemberAvatarURL(guildId, id, member, user, 80);
    const displayName = member?.nick || user.globalName || user.username;
    const secondaryName = member?.nick ? user.username : (user.globalName ? user.username : "");
    
    return h("div", { className: "server-info-row", onClick: () => onClick(id, guildId) },
        h("div", { className: "server-info-avatar-wrapper" },
            h("img", { className: "server-info-avatar", src: avatarUrl }),
            h(StatusIcon, { status: presence })
        ),
        h("div", { className: "server-info-row-names" },
            h("span", { className: "server-info-row-display" }, displayName),
            secondaryName && h("span", { className: "server-info-row-secondary" }, `@${secondaryName}`)
        )
    );
}

function ServerInfoModal({ guild, onClose }) {
    const [currentTab, setCurrentTab] = React.useState(0);
    const [owner, setOwner] = React.useState(null);
    const [activeImageUrl, setActiveImageUrl] = React.useState(null);
    const [, forceUpdate] = React.useState({});
    
    React.useEffect(() => {
        if (guild.ownerId) {
            let foundOwner = null;
            if (UserStore) foundOwner = UserStore.getUser(guild.ownerId);
            if (!foundOwner && GuildMemberStore) {
                const member = GuildMemberStore.getMember(guild.id, guild.ownerId);
                if (member && member.user) foundOwner = member.user;
            }
            
            if (foundOwner) {
                setOwner(foundOwner);
            } else {
                if (FluxDispatcher) {
                    try {
                        FluxDispatcher.dispatch({
                            type: "GUILD_MEMBERS_REQUEST",
                            guildIds: [guild.id],
                            userIds: [guild.ownerId]
                        });
                    } catch (e) {
                        console.error("[ServerInfo] Error requesting owner member", e);
                    }
                }
                
                fetchUser(guild.ownerId).then(user => {
                    if (user) {
                        setOwner(user);
                    } else {
                        const doubleCheck = UserStore ? UserStore.getUser(guild.ownerId) : null;
                        if (!doubleCheck) {
                            setOwner({
                                id: guild.ownerId,
                                username: `ID: ${guild.ownerId}`,
                                globalName: `Владелец (ID: ${guild.ownerId})`,
                                avatar: null
                            });
                        }
                    }
                });
            }
        }
    }, [guild.ownerId, guild.id]);
    
    React.useEffect(() => {
        if (!RelationshipStore || !FluxDispatcher) return;
        try {
            const getIdsArray = (type) => {
                if (type === "friends") return RelationshipStore.getFriendIDs() ? Array.from(RelationshipStore.getFriendIDs()) : [];
                if (type === "blocked") return RelationshipStore.getBlockedIDs() ? Array.from(RelationshipStore.getBlockedIDs()) : [];
                if (type === "ignored") return RelationshipStore.getIgnoredIDs ? Array.from(RelationshipStore.getIgnoredIDs()) : [];
                return [];
            };
            
            const friendIds = getIdsArray("friends");
            const blockedIds = getIdsArray("blocked");
            const ignoredIds = getIdsArray("ignored");
            const allIds = [...new Set([...friendIds, ...blockedIds, ...ignoredIds])];
            
            const missingMembers = allIds.filter(id => GuildMemberStore && !GuildMemberStore.isMember(guild.id, id));
            
            if (missingMembers.length > 0) {
                FluxDispatcher.dispatch({
                    type: "GUILD_MEMBERS_REQUEST",
                    guildIds: [guild.id],
                    userIds: missingMembers
                });
            }
        } catch (e) {
            console.error("[ServerInfo] Error fetching missing members", e);
        }
    }, [guild.id]);
    
    React.useEffect(() => {
        const handleUpdate = () => forceUpdate({});
        if (FluxDispatcher) {
            FluxDispatcher.subscribe("GUILD_MEMBER_LIST_UPDATE", handleUpdate);
            FluxDispatcher.subscribe("GUILD_MEMBERS_CHUNK", handleUpdate);
            return () => {
                FluxDispatcher.unsubscribe("GUILD_MEMBER_LIST_UPDATE", handleUpdate);
                FluxDispatcher.unsubscribe("GUILD_MEMBERS_CHUNK", handleUpdate);
            };
        }
    }, []);

    React.useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    // Try-catch block specifically wrapping render logic
    try {
        const getRelations = (type) => {
            if (!RelationshipStore || !GuildMemberStore) return [];
            let ids = [];
            try {
                if (type === "friends") {
                    const raw = RelationshipStore.getFriendIDs();
                    ids = raw ? Array.from(raw) : [];
                } else if (type === "blocked") {
                    const raw = RelationshipStore.getBlockedIDs();
                    ids = raw ? Array.from(raw) : [];
                } else if (type === "ignored") {
                    const raw = RelationshipStore.getIgnoredIDs ? RelationshipStore.getIgnoredIDs() : [];
                    ids = raw ? Array.from(raw) : [];
                }
            } catch (e) {
                console.error("[ServerInfo] Error resolving raw ids for " + type, e);
            }
            
            const currentUser = UserStore ? UserStore.getCurrentUser() : null;
            const currentUserId = currentUser ? currentUser.id : null;
            
            return ids.filter(id => {
                if (currentUserId && id === currentUserId) return false;
                try {
                    return (GuildMemberStore.isMember && GuildMemberStore.isMember(guild.id, id)) || 
                           (GuildMemberStore.getMember && GuildMemberStore.getMember(guild.id, id));
                } catch (err) {
                    return false;
                }
            });
        };
        
        const friends = getRelations("friends");
        const blocked = getRelations("blocked");
        const ignored = getRelations("ignored");
        
        const isIconAnimated = guild.icon && guild.icon.startsWith("a_");
        const iconUrl = guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${isIconAnimated ? "gif" : "png"}?size=512` : null;
        
        const isBannerAnimated = guild.banner && guild.banner.startsWith("a_");
        const bannerUrl = guild.banner ? `https://cdn.discordapp.com/banners/${guild.id}/${guild.banner}.${isBannerAnimated ? "gif" : "png"}?size=1024` : null;
        
        const tabHeaders = [
            `Информация`,
            `Друзья (${friends.length})`,
            `Заблокированные (${blocked.length})`,
            `Игнорируемые (${ignored.length})`
        ];
        
        const renderTabContent = () => {
            if (currentTab === 0) {
                const fields = [
                    {
                        label: "Владелец сервера",
                        value: owner ? h("div", { className: "server-info-owner", onClick: () => openProfile(owner.id, guild.id) },
                            h("img", { className: "server-info-owner-avatar", src: getMemberAvatarURL(guild.id, owner.id, GuildMemberStore?.getMember(guild.id, owner.id), owner, 48) }),
                            h("span", { className: "server-info-owner-name" }, owner.globalName || owner.username)
                        ) : "Загрузка..."
                    },
                    {
                        label: "Дата создания",
                        value: formatTimestamp(Number(BigInt(guild.id) >> 22n) + 1420070400000)
                    },
                    {
                        label: "Дата вступления",
                        value: guild.joinedAt ? formatTimestamp(new Date(guild.joinedAt)) : "-"
                    },
                    {
                        label: "Короткая ссылка",
                        value: guild.vanityURLCode ? h("a", {
                            href: "#",
                            onClick: (e) => {
                                e.preventDefault();
                                BdApi.Clipboard.copy(`https://discord.gg/${guild.vanityURLCode}`);
                                BdApi.UI.showToast("Ссылка скопирована в буфер обмена!", { type: "success" });
                            }
                        }, `discord.gg/${guild.vanityURLCode}`) : "-"
                    },
                    {
                        label: "Язык сервера",
                        value: guild.preferredLocale || "-"
                    },
                    {
                        label: "Уровень верификации",
                        value: ["Отсутствует", "Низкий", "Средний", "Высокий", "Наивысший"][guild.verificationLevel] || "?"
                    },
                    {
                        label: "Бусты сервера",
                        value: `${guild.premiumSubscriberCount ?? 0} (Уровень ${guild.premiumTier ?? 0})`
                    },
                    {
                        label: "Число каналов",
                        value: String(getChannelsCount(guild.id))
                    },
                    {
                        label: "Число ролей",
                        value: String(getRolesCount(guild.id))
                    }
                ];
                
                return h("div", { className: "server-info-grid" },
                    fields.map((f, i) => h("div", { key: i, className: "server-info-card" },
                        h("div", { className: "server-info-label" }, f.label),
                        h("div", { className: "server-info-value" }, f.value)
                    ))
                );
            } else {
                const listType = currentTab === 1 ? "friends" : currentTab === 2 ? "blocked" : "ignored";
                const userList = listType === "friends" ? friends : listType === "blocked" ? blocked : ignored;
                
                if (userList.length === 0) {
                    return h("div", { className: "server-info-empty" },
                        h("div", { className: "server-info-empty-icon" }, listType === "friends" ? "👥" : listType === "blocked" ? "🚫" : "🔕"),
                        h("span", {}, listType === "friends" ? "Нет друзей на этом сервере" : listType === "blocked" ? "Нет заблокированных пользователей на этом сервере" : "Нет игнорируемых пользователей на этом сервере")
                    );
                }
                
                return h("div", { className: "server-info-list" },
                    userList.map(id => h(UserRow, {
                        key: id,
                        id: id,
                        guildId: guild.id,
                        onClick: openProfile
                    }))
                );
            }
        };
        
        const handleBackdropClick = (e) => {
            if (e.target.className === "server-info-modal-backdrop") onClose();
        };
        
        return h("div", { className: "server-info-modal-backdrop", onClick: handleBackdropClick },
            h("div", { className: "server-info-modal-card" },
                h("button", { className: "server-info-close-btn", onClick: onClose }, "✕"),
                
                bannerUrl ? h("div", {
                    className: "server-info-banner",
                    style: { backgroundImage: `url(${bannerUrl})` },
                    onClick: () => setActiveImageUrl(bannerUrl)
                }) : h("div", { className: "server-info-banner-placeholder" }),
                
                h("div", { className: "server-info-header" },
                    h("div", { className: "server-info-icon-container" },
                        iconUrl ? h("img", {
                            className: "server-info-icon",
                            src: iconUrl,
                            onClick: () => setActiveImageUrl(iconUrl)
                        }) : h("div", { className: "server-info-icon-acronym" }, getGuildAcronym(guild))
                    ),
                    h("div", { className: "server-info-meta" },
                        h("h2", { className: "server-info-name" }, guild.name),
                        guild.description && h("p", { className: "server-info-description" }, guild.description)
                    )
                ),
                
                h("div", { className: "server-info-tab-bar" },
                    tabHeaders.map((title, index) => h("div", {
                        key: index,
                        className: `server-info-tab${currentTab === index ? " active" : ""}`,
                        onClick: () => setCurrentTab(index)
                    }, title))
                ),
                
                h("div", { className: "server-info-content" },
                    renderTabContent()
                )
            ),
            
            activeImageUrl && h("div", {
                className: "server-info-image-backdrop",
                onClick: () => setActiveImageUrl(null)
            },
                h("div", { className: "server-info-image-container" },
                    h("img", {
                        className: "server-info-viewer-img",
                        src: activeImageUrl,
                        onClick: (e) => e.stopPropagation()
                    })
                )
            )
        );
    } catch (err) {
        console.error("[ServerInfo] Render error:", err);
        return h("div", { 
            style: { 
                position: "fixed", 
                top: "50%", 
                left: "50%", 
                transform: "translate(-50%, -50%)", 
                background: "#2b2d31", 
                color: "#f23f43", 
                padding: "20px", 
                borderRadius: "8px", 
                zIndex: 999,
                boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                width: "400px"
            } 
        }, 
            h("h3", {}, "Ошибка рендеринга модального окна"),
            h("pre", { style: { whiteSpace: "pre-wrap", color: "#dbdee1", fontSize: "11px", overflowX: "auto" } }, err.stack),
            h("button", { 
                onClick: onClose, 
                style: { 
                    marginTop: "12px", 
                    padding: "6px 12px", 
                    background: "#5865f2", 
                    color: "white", 
                    border: "none", 
                    borderRadius: "4px", 
                    cursor: "pointer" 
                } 
            }, "Закрыть")
        );
    }
}

function openServerInfoModal(guild) {
    try {
        let root = document.getElementById("server-info-modal-root");
        if (root) {
            unmountElement(root);
            root.remove();
        }
        
        root = document.createElement("div");
        root.id = "server-info-modal-root";
        document.getElementById("app-mount").appendChild(root);
        
        renderElement(
            h(ServerInfoModal, {
                guild: guild,
                onClose: () => {
                    const r = document.getElementById("server-info-modal-root");
                    if (r) {
                        unmountElement(r);
                        r.remove();
                    }
                }
            }),
            root
        );
    } catch (err) {
        console.error("[ServerInfo] Error opening modal:", err);
        if (BdApi && BdApi.UI && typeof BdApi.UI.alert === "function") {
            BdApi.UI.alert("Ошибка плагина ServerInfo", `Не удалось открыть окно информации о сервере. Ошибка: ${err.message}\n\nПожалуйста, откройте консоль разработчика (Ctrl+Shift+I) для подробностей.`);
        }
    }
}

const CSS_CONTENT = `
.server-info-modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999;
    animation: server-info-fade-in 0.2s ease-out;
}

@keyframes server-info-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
}

.server-info-modal-card {
    width: 580px;
    max-height: 85vh;
    background: #1e1f22;
    border-radius: 16px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.08);
    position: relative;
    animation: server-info-scale-up 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.15);
}

@keyframes server-info-scale-up {
    from { transform: scale(0.92); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
}

.server-info-close-btn {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.5);
    border: none;
    color: #dbdee1;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 10;
    transition: background 0.2s, color 0.2s, transform 0.2s;
}
.server-info-close-btn:hover {
    background: rgba(239, 68, 68, 0.9);
    color: white;
    transform: rotate(90deg);
}

.server-info-banner {
    height: 160px;
    width: 100%;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    cursor: pointer;
    position: relative;
    background-color: #2b2d31;
    transition: filter 0.2s;
}
.server-info-banner:hover {
    filter: brightness(0.9);
}
.server-info-banner-placeholder {
    height: 160px;
    width: 100%;
    background: linear-gradient(135deg, #3842c7, #242c94);
    position: relative;
}

.server-info-header {
    padding: 16px 24px;
    display: flex;
    align-items: flex-end;
    position: relative;
    background: #1e1f22;
}

.server-info-icon-container {
    margin-top: -60px;
    position: relative;
    z-index: 2;
}
.server-info-icon {
    width: 90px;
    height: 90px;
    border-radius: 20px;
    border: 5px solid #1e1f22;
    background: #2b2d31;
    object-fit: cover;
    cursor: pointer;
    box-shadow: 0 8px 16px rgba(0,0,0,0.3);
    transition: transform 0.2s, filter 0.2s;
}
.server-info-icon:hover {
    transform: scale(1.03);
    filter: brightness(0.9);
}
.server-info-icon-acronym {
    width: 90px;
    height: 90px;
    border-radius: 20px;
    border: 5px solid #1e1f22;
    background: #2b2d31;
    box-shadow: 0 8px 16px rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32px;
    font-weight: 700;
    color: #dbdee1;
}

.server-info-meta {
    margin-left: 20px;
    flex: 1;
    overflow: hidden;
}
.server-info-name {
    font-size: 20px;
    font-weight: 700;
    color: #f2f3f5;
    margin: 0 0 4px 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.server-info-description {
    font-size: 13px;
    color: #b5bac1;
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.server-info-tab-bar {
    display: flex;
    padding: 0 16px;
    background: #1e1f22;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    gap: 8px;
}
.server-info-tab {
    padding: 12px 16px;
    color: #949ba4;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    border-bottom: 2px solid transparent;
    transition: color 0.2s, border-color 0.2s;
    user-select: none;
}
.server-info-tab:hover {
    color: #dbdee1;
}
.server-info-tab.active {
    color: #f2f3f5;
    border-bottom-color: #5865f2;
}

.server-info-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
    background: #1e1f22;
}

.server-info-content::-webkit-scrollbar {
    width: 8px;
}
.server-info-content::-webkit-scrollbar-track {
    background: transparent;
}
.server-info-content::-webkit-scrollbar-thumb {
    background: #1a1b1e;
    border-radius: 4px;
}
.server-info-content::-webkit-scrollbar-thumb:hover {
    background: #111214;
}

.server-info-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
}
.server-info-card {
    background: #2b2d31;
    border-radius: 8px;
    padding: 14px;
    border: 1px solid rgba(255, 255, 255, 0.03);
    transition: transform 0.2s, background-color 0.2s;
}
.server-info-card:hover {
    transform: translateY(-2px);
    background-color: #313338;
}
.server-info-label {
    font-size: 11px;
    text-transform: uppercase;
    font-weight: 700;
    color: #949ba4;
    margin-bottom: 6px;
    letter-spacing: 0.5px;
}
.server-info-value {
    font-size: 14px;
    color: #dbdee1;
    font-weight: 500;
}
.server-info-value a {
    color: #00a8fc;
    text-decoration: none;
}
.server-info-value a:hover {
    text-decoration: underline;
}

.server-info-owner {
    display: flex;
    align-items: center;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 6px;
    transition: background 0.15s;
    width: fit-content;
}
.server-info-owner:hover {
    background: rgba(255,255,255,0.05);
}
.server-info-owner-avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    margin-right: 8px;
    object-fit: cover;
}
.server-info-owner-name {
    font-size: 14px;
    color: #dbdee1;
    font-weight: 600;
}

.server-info-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.server-info-row {
    display: flex;
    align-items: center;
    padding: 10px 14px;
    border-radius: 8px;
    background: #2b2d31;
    border: 1px solid rgba(255, 255, 255, 0.02);
    cursor: pointer;
    transition: background 0.2s, transform 0.15s;
}
.server-info-row:hover {
    background: #313338;
    transform: translateX(4px);
}
.server-info-avatar-wrapper {
    position: relative;
    width: 40px;
    height: 40px;
    margin-right: 12px;
}
.server-info-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    object-fit: cover;
}
.server-info-avatar-placeholder {
    background: #313338;
    animation: server-info-pulse 1.5s infinite;
}
@keyframes server-info-pulse {
    0% { opacity: 0.6; }
    50% { opacity: 0.3; }
    100% { opacity: 0.6; }
}
.server-info-status-svg {
    position: absolute;
    bottom: -3px;
    right: -3px;
    background: #2b2d31;
    border-radius: 50%;
    padding: 2px;
    transition: background-color 0.2s;
}
.server-info-row:hover .server-info-status-svg {
    background: #313338;
}

.server-info-row-names {
    display: flex;
    flex-direction: column;
}
.server-info-row-display {
    font-size: 14px;
    font-weight: 600;
    color: #f2f3f5;
}
.server-info-row-secondary {
    font-size: 12px;
    color: #949ba4;
}

.server-info-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 0;
    color: #949ba4;
    font-size: 15px;
    text-align: center;
}
.server-info-empty-icon {
    font-size: 40px;
    margin-bottom: 12px;
    opacity: 0.6;
}

.server-info-image-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.9);
    z-index: 1001;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(12px);
    animation: server-info-fade-in 0.2s ease-out;
}
.server-info-image-container {
    position: relative;
    max-width: 90vw;
    max-height: 90vh;
    animation: server-info-image-zoom 0.25s cubic-bezier(0.15, 0.85, 0.35, 1.1);
}
@keyframes server-info-image-zoom {
    from { transform: scale(0.9); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
}
.server-info-viewer-img {
    max-width: 90vw;
    max-height: 90vh;
    border-radius: 8px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.8);
    object-fit: contain;
}
`;

module.exports = class ServerInfo {
    constructor(meta) {
        for (let key in meta) this[key] = meta[key];
    }
    
    start() {
        initModules();
        
        // Inject styles
        if (BdApi.DOM && typeof BdApi.DOM.addStyle === "function") {
            BdApi.DOM.addStyle("ServerInfoStyles", CSS_CONTENT);
        } else {
            BdApi.injectCSS("ServerInfoStyles", CSS_CONTENT);
        }
        
        // Patch context menu
        this.patchContextMenus();
        
        try {
            BdApi.UI.showToast("Плагин ServerInfo успешно запущен!", { type: "info" });
        } catch (e) {}
    }
    
    stop() {
        // Remove styles
        if (BdApi.DOM && typeof BdApi.DOM.removeStyle === "function") {
            BdApi.DOM.removeStyle("ServerInfoStyles");
        } else {
            BdApi.clearCSS("ServerInfoStyles");
        }
        
        // Unpatch context menus
        this.unpatchContextMenus();
        
        // Clean up open modal
        const root = document.getElementById("server-info-modal-root");
        if (root) {
            unmountElement(root);
            root.remove();
        }
    }
    
    patchContextMenus() {
        this.unpatches = [];
        
        const patchCallback = (ret, props) => {
            try {
                const guild = props.guild;
                if (!guild) return;
                
                const targetNavId = ret && ret.props && ret.props.navId ? ret.props.navId : (props.navId || "guild-context");
                
                const menu = findInReactTree(ret, e => e && e.props && e.props.navId === targetNavId);
                if (!menu || !menu.props) return;
                
                let children = menu.props.children;
                if (!children) {
                    menu.props.children = [];
                    children = menu.props.children;
                } else if (!Array.isArray(children)) {
                    menu.props.children = [children];
                    children = menu.props.children;
                }
                
                const hasItem = findInReactTree(menu, e => e && e.props && e.props.id === "server-info-profile");
                if (hasItem) return;
                
                const newGroup = BdApi.ContextMenu.buildMenuChildren([{
                    type: "group",
                    items: [{
                        type: "normal",
                        label: "Профиль сервера",
                        id: "server-info-profile",
                        action: () => openServerInfoModal(guild)
                    }]
                }]);
                
                children.push(newGroup);
                console.log(`[ServerInfo] Added menu item for guild: ${guild.name}`);
            } catch (err) {
                console.error("[ServerInfo] Error in context menu patch", err);
            }
        };
        
        try {
            this.unpatches.push(BdApi.ContextMenu.patch("guild-context", patchCallback));
            this.unpatches.push(BdApi.ContextMenu.patch("guild-header-popout", patchCallback));
        } catch (err) {
            console.error("[ServerInfo] Failed to patch context menus", err);
        }
    }
    
    unpatchContextMenus() {
        if (this.unpatches) {
            for (const unpatch of this.unpatches) {
                try {
                    unpatch();
                } catch (e) {
                    console.error("[ServerInfo] Error in unpatch", e);
                }
            }
            this.unpatches = [];
        }
    }
};
