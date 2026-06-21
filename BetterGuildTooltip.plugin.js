/**
 * @name BetterGuildTooltip
 * @author DevilBro, senkih
 * @version 9.9.9
 * @description Displays the online and total member count directly in the server tooltip.
 * @invite Jx3TjNS
 */

module.exports = (_ => {
	const changeLog = {};

	return !window.BDFDB_Global || (!window.BDFDB_Global.loaded && !window.BDFDB_Global.started) ? class {
		constructor (meta) {for (let key in meta) this[key] = meta[key];}
		getName () {return this.name;}
		getAuthor () {return this.author;}
		getVersion () {return this.version;}
		getDescription () {return `The Library Plugin needed for ${this.name} is missing. Please click "Download Now" to install it. \n\n${this.description}`;}
		
		downloadLibrary () {
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
		
		load () {
			if (!window.BDFDB_Global || !Array.isArray(window.BDFDB_Global.pluginQueue)) window.BDFDB_Global = Object.assign({}, window.BDFDB_Global, {pluginQueue: []});
			if (!window.BDFDB_Global.downloadModal) {
				window.BDFDB_Global.downloadModal = true;
				BdApi.UI.showConfirmationModal("Library Missing", `The Library Plugin needed for ${this.name} is missing. Please click "Download Now" to install it.`, {
					confirmText: "Download Now",
					cancelText: "Cancel",
					onCancel: _ => {delete window.BDFDB_Global.downloadModal;},
					onConfirm: _ => {
						delete window.BDFDB_Global.downloadModal;
						this.downloadLibrary();
					}
				});
			}
			if (!window.BDFDB_Global.pluginQueue.includes(this.name)) window.BDFDB_Global.pluginQueue.push(this.name);
		}
		start () {this.load();}
		stop () {}
	} : (([Plugin, BDFDB]) => {
		var _this;
	
		let GuildActions, GuildChannelStore, Dispatcher;
		let subscribed = false;

		const onlineMemberCounts = new Map();
		let preloadInProccess = false;
		let preloadNext = null;
		const PRELOAD_DELAY = 200;

		function initWebpackAndSubscribe() {
			try {
				if (!GuildActions) GuildActions = BdApi.Webpack.getByKeys('preload', 'closePrivateChannel');
				if (!GuildChannelStore) GuildChannelStore = BdApi.Webpack.getStore('GuildChannelStore');
				if (!Dispatcher) Dispatcher = BdApi.Webpack.getModule(m => m.dispatch && m.subscribe, { searchExports: true }) || BdApi.Webpack.getByKeys("dispatch", "subscribe");

				if (Dispatcher && !subscribed) {
					Dispatcher.subscribe('GUILD_MEMBER_LIST_UPDATE', handleGuildMemberListUpdate);
					Dispatcher.subscribe('ONLINE_GUILD_MEMBER_COUNT_UPDATE', handleOnlineGuildMemberCountUpdate);
					Dispatcher.subscribe('GUILD_DELETE', handleGuildDelete);
					subscribed = true;
				}
			} catch (e) {
				console.error("BetterGuildTooltip helper init error:", e);
			}
		}

		function unsubscribeDispatcher() {
			try {
				if (Dispatcher && subscribed) {
					Dispatcher.unsubscribe('GUILD_MEMBER_LIST_UPDATE', handleGuildMemberListUpdate);
					Dispatcher.unsubscribe('ONLINE_GUILD_MEMBER_COUNT_UPDATE', handleOnlineGuildMemberCountUpdate);
					Dispatcher.unsubscribe('GUILD_DELETE', handleGuildDelete);
					subscribed = false;
				}
			} catch (e) {
				console.error("BetterGuildTooltip helper unsubscribe error:", e);
			}
		}

		function preloadGuild (guild) {
			if (!guild || preloadInProccess) return preloadNext = guild;

			_preloadGuild(guild);
			preloadInProccess = true;
			setTimeout(() => {
				preloadInProccess = false;
				preloadGuild(preloadNext);
				preloadNext = null;
			}, PRELOAD_DELAY);
		}

		function _preloadGuild (guild) {
			initWebpackAndSubscribe();
			if (GuildActions && GuildChannelStore) {
				const defaultChannel = GuildChannelStore.getDefaultChannel(guild.id);
				if (defaultChannel) {
					GuildActions.preload(guild.id, defaultChannel.id);
				}
			}
		}

		let activeDetailsComponent = null;

		function handleGuildMemberListUpdate ({ guildId, memberCount, groups }) {
			onlineMemberCounts.set(
				guildId,
				groups.reduce((total, group) => {
					return group.id !== 'offline' ? total + group.count : total;
				}, 0)
			);
			if (activeDetailsComponent && activeDetailsComponent.props.guild.id === guildId) {
				activeDetailsComponent.forceUpdate();
			}
		}

		function handleOnlineGuildMemberCountUpdate ({ guildId, count }) {
			onlineMemberCounts.set(guildId, count);
			if (activeDetailsComponent && activeDetailsComponent.props.guild.id === guildId) {
				activeDetailsComponent.forceUpdate();
			}
		}

		function handleGuildDelete ({ guild }) {
			onlineMemberCounts.delete(guild.id);
		}

		function formatNumber (number) {
			if (number === undefined || number === null) return '0';
			return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
		}

		function renderCounters (guild) {
			initWebpackAndSubscribe();
			const total = BDFDB.LibraryStores.GuildMemberCountStore.getMemberCount(guild.id) || guild.approximateMemberCount || 0;
			const online = onlineMemberCounts.get(guild.id) || guild.approximatePresenceCount || 0;
			
			if (total === 0) return null;

			return BdApi.React.createElement('div', {
				style: { 
					display: 'flex', 
					alignItems: 'center', 
					gap: '16px',
					fontSize: '14px',
					fontWeight: '600',
					color: '#dbdee1',
					marginTop: '-2px',
					lineHeight: '16px',
					whiteSpace: 'nowrap'
				}
			}, [
				BdApi.React.createElement('span', { 
					style: { display: 'flex', alignItems: 'center', gap: '6px' } 
				}, [
					BdApi.React.createElement('span', { 
						style: {
							width: '10px',
							height: '10px',
							borderRadius: '50%',
							display: 'inline-block',
							backgroundColor: '#23a55a'
						} 
					}),
					BdApi.React.createElement('span', {}, formatNumber(online))
				]),
				BdApi.React.createElement('span', { 
					style: { display: 'flex', alignItems: 'center', gap: '6px' } 
				}, [
					BdApi.React.createElement('span', { 
						style: {
							width: '10px',
							height: '10px',
							borderRadius: '50%',
							display: 'inline-block',
							backgroundColor: '#80848e'
						} 
					}),
					BdApi.React.createElement('span', {}, formatNumber(total))
				])
			]);
		}

		const GuildDetailsComponent = class GuildDetails extends BdApi.React.Component {
			constructor(props) {
				super(props);
			}
			componentDidMount() {
				activeDetailsComponent = this;
				initWebpackAndSubscribe();
			}
			componentWillUnmount() {
				if (activeDetailsComponent === this) {
					activeDetailsComponent = null;
				}
			}
			render() {
				if (!onlineMemberCounts.has(this.props.guild.id)) {
					preloadGuild(this.props.guild);
				}
				return renderCounters(this.props.guild);
			}
		};
		
		return class BetterGuildTooltip extends Plugin {
			onLoad () {
				_this = this;
				
				this.modulePatches = {
					after: [
						"GuildItem"
					]
				};
				
				this.patchPriority = 9;
			}
			
			onStart () {
				initWebpackAndSubscribe();
				BDFDB.DiscordUtils.rerenderAll();
			}
			
			onStop () {
				unsubscribeDispatcher();
				BDFDB.DiscordUtils.rerenderAll();
			}
			
			processGuildItem (e) {
				if (!e.instance.props.guild) return;
				if (!BDFDB.GuildUtils.is(e.instance.props.guild)) return;
				let tooltipContainer;
				e.returnvalue.props.children[1] = BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TooltipContainer, Object.assign({}, e.returnvalue.props, {
					ref: instance => {if (instance) tooltipContainer = instance;},
					tooltipConfig:  Object.assign({}, e.returnvalue.props.children[1].props.tooltipConfig, {
						type: "right",
						guild: e.instance.props.guild,
						list: true,
						offset: 4
					}),
					text: (instance, event) => BDFDB.ReactUtils.createElement(GuildDetailsComponent, {
						tooltipContainer: tooltipContainer,
						guild: e.instance.props.guild
					}),
					children: e.returnvalue.props.children[1].props.children
				}));
			}
		};
	})(window.BDFDB_Global.PluginUtils.buildPlugin(changeLog));
})();
