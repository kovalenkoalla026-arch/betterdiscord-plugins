/**
 * @name ServerDetails
 * @author DevilBro
 * @authorId 278543574059057154
 * @version 1.3.7
 * @description Shows Server Details in the Server List Tooltip
 * @invite Jx3TjNS
 * @donate https://www.paypal.me/MircoWittrien
 * @patreon https://www.patreon.com/MircoWittrien
 * @website https://mwittrien.github.io/
 * @source https://github.com/mwittrien/BetterDiscordAddons/tree/master/Plugins/ServerDetails/
 * @updateUrl https://mwittrien.github.io/BetterDiscordAddons/Plugins/ServerDetails/ServerDetails.plugin.js
 */

module.exports = (_ => {
	const changeLog = {
		
	};

	return !window.BDFDB_Global || (!window.BDFDB_Global.loaded && !window.BDFDB_Global.started) ? class {
		constructor (meta) {for (let key in meta) this[key] = meta[key];}
		getName () {return this.name;}
		getAuthor () {return this.author;}
		getVersion () {return this.version;}
		getDescription () {return `The Library Plugin needed for ${this.name} is missing. Open the Plugin Settings to download it. \n\n${this.description}`;}
		
		downloadLibrary () {
			BdApi.Net.fetch("https://mwittrien.github.io/BetterDiscordAddons/Library/0BDFDB.plugin.js").then(r => {
				if (!r || r.status != 200) throw new Error();
				else return r.text();
			}).then(b => {
				if (!b) throw new Error();
				else return require("fs").writeFile(require("path").join(BdApi.Plugins.folder, "0BDFDB.plugin.js"), b, _ => BdApi.UI.showToast("Finished downloading BDFDB Library", {type: "success"}));
			}).catch(error => {
				BdApi.UI.alert("Error", "Could not download BDFDB Library Plugin. Try again later or download it manually from GitHub: https://mwittrien.github.io/downloader/?library");
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
		getSettingsPanel () {
			let template = document.createElement("template");
			template.innerHTML = `<div style="color: var(--text-strong); font-size: 16px; font-weight: 300; white-space: pre; line-height: 22px;">The Library Plugin needed for ${this.name} is missing.\nPlease click <a style="font-weight: 500;">Download Now</a> to install it.</div>`;
			template.content.firstElementChild.querySelector("a").addEventListener("click", this.downloadLibrary);
			return template.content.firstElementChild;
		}
	} : (([Plugin, BDFDB]) => {
		var _this;
	
		let GuildActions, GuildChannelStore, GuildClasses, Dispatcher;
		let subscribed = false;

		const onlineMemberCounts = new Map();
		let preloadInProccess = false;
		let preloadNext = null;
		const PRELOAD_DELAY = 200;

		function initWebpackAndSubscribe() {
			try {
				if (!GuildActions) GuildActions = BdApi.Webpack.getByKeys('preload', 'closePrivateChannel');
				if (!GuildChannelStore) GuildChannelStore = BdApi.Webpack.getStore('GuildChannelStore');
				if (!GuildClasses) GuildClasses = BdApi.Webpack.getByKeys('statusOffline', 'guildDetail') || {};
				if (!Dispatcher) Dispatcher = BdApi.Webpack.getModule(m => m.dispatch && m.subscribe, { searchExports: true }) || BdApi.Webpack.getByKeys("dispatch", "subscribe");

				if (Dispatcher && !subscribed) {
					Dispatcher.subscribe('GUILD_MEMBER_LIST_UPDATE', handleGuildMemberListUpdate);
					Dispatcher.subscribe('ONLINE_GUILD_MEMBER_COUNT_UPDATE', handleOnlineGuildMemberCountUpdate);
					Dispatcher.subscribe('GUILD_DELETE', handleGuildDelete);
					subscribed = true;
				}
			} catch (e) {
				console.error("ServerDetails helper init error:", e);
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
				console.error("ServerDetails helper unsubscribe error:", e);
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
			return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
		}

		function renderCounters (guild) {
			initWebpackAndSubscribe();
			const total = BDFDB.LibraryStores.GuildMemberCountStore.getMemberCount(guild.id);
			const online = onlineMemberCounts.get(guild.id);
			
			const classes = GuildClasses || {};
			
			if (online === undefined) {
				return BdApi.React.createElement('div', {
					className: classes.guildDetail,
					style: { marginTop: '5px', marginBottom: '5px' }
				}, 
					BdApi.React.createElement('div', {
						className: classes.statusCounts,
						style: { display: 'flex', alignItems: 'center', gap: '4px' }
					}, [
						BdApi.React.createElement('i', { className: classes.statusOffline, style: { marginRight: '4px' } }),
						BdApi.React.createElement('span', { className: classes.count }, formatNumber(total))
					])
				);
			}

			return BdApi.React.createElement('div', {
				className: classes.guildDetail,
				style: { marginTop: '5px', marginBottom: '5px' }
			}, 
				BdApi.React.createElement('div', {
					className: classes.statusCounts,
					style: { display: 'flex', alignItems: 'center', gap: '12px' }
				}, [
					BdApi.React.createElement('span', { style: { display: 'flex', alignItems: 'center' } }, [
						BdApi.React.createElement('i', { className: classes.statusOnline, style: { marginRight: '4px' } }),
						BdApi.React.createElement('span', { className: classes.count }, formatNumber(online))
					]),
					BdApi.React.createElement('span', { style: { display: 'flex', alignItems: 'center' } }, [
						BdApi.React.createElement('i', { className: classes.statusOffline, style: { marginRight: '4px' } }),
						BdApi.React.createElement('span', { className: classes.count }, formatNumber(total))
					])
				])
			);
		}

		const GuildDetailsComponent = class GuildDetails extends BdApi.React.Component {
			constructor(props) {
				super(props);
				this.state = {fetchedOwner: false, delayed: false, repositioned: false, shouldReposition: false, forced: false};
			}
			componentDidUpdate() {
				let tooltip = BDFDB.DOMUtils.getParent(BDFDB.dotCN.tooltip, BDFDB.ReactUtils.findDOMNode(this));
				if (tooltip) {
					BDFDB.DOMUtils.addClass(tooltip, BDFDB.disCN._serverdetailstooltip);
				}
				if (this.state.shouldReposition || _this.settings.amounts.tooltipDelay && this.state.delayed && !this.state.repositioned) {
					this.state.repositioned = true;
					this.state.shouldReposition = false;
					if (this.props.tooltipContainer && this.props.tooltipContainer.tooltip) {
						setTimeout(() => {
							if (this.props.tooltipContainer && this.props.tooltipContainer.tooltip) {
								this.props.tooltipContainer.tooltip.update();
							}
						}, 50);
					}
				}
			}
			componentDidMount() {
				activeDetailsComponent = this;
				initWebpackAndSubscribe();
				
				let tooltip = BDFDB.DOMUtils.getParent(BDFDB.dotCN.tooltip, BDFDB.ReactUtils.findDOMNode(this));
				if (tooltip) {
					BDFDB.DOMUtils.addClass(tooltip, BDFDB.disCN._serverdetailstooltip);
				}
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
		
		const GuildDetailsRowComponent = class GuildDetailsRow extends BdApi.React.Component {
			render() {
				return BDFDB.ReactUtils.createElement("div", {
					children: `${BDFDB.StringUtils.upperCaseFirstChar(this.props.prefix)}: ${this.props.string}`
				});
			}
		};
		
		return class ServerDetails extends Plugin {
			onLoad () {
				_this = this;
				
				this.defaults = {
					general: {
						onlyShowOnShift:	{value: false,	description: "Only show the Details Tooltip, while holding 'Shift'"}
					},
					items: {
						icon:			{value: false, 	description: "icon"},
						owner:			{value: false, 	description: "SERVER_OWNER"},
						creationDate:		{value: false, 	description: "creation_date"},
						joinDate:		{value: false, 	description: "join_date"},
						members:		{value: true, 	description: "MEMBERS"},
						channels:		{value: false, 	description: "CHANNELS"},
						roles:			{value: false, 	description: "ROLES"},
						boosts:			{value: false, 	description: "boosts"},
						language:		{value: false, 	description: "LANGUAGE"}
					},
					dates: {
						tooltipDates:		{value: {}, 	description: "Tooltip Dates"}
					},
					colors: {
						tooltipColor:		{value: "", 	description: "Tooltip Color"}
					},
					amounts: {
						tooltipDelay:		{value: 0,	min: 0,		max: 10,	digits: 1,	unit: "s",	description: "Tooltip Delay"},
						tooltipWidth:		{value: 200,	min: 150,	max: 400,	digits: 0,	unit: "px",	description: "Tooltip Width"}
					}
				};
			
				this.modulePatches = {
					after: [
						"GuildItem"
					]
				};
				
				this.patchPriority = 9;
				
				this.css = `
					${BDFDB.dotCNS._serverdetailstooltip + BDFDB.dotCN.tooltipcontent} {
						display: flex;
						flex-direction: column;
						justify-content: center;
						align-items: center;
						max-width: unset;
						word-wrap: unset;
					}
					${BDFDB.dotCN._serverdetailstooltip} [class*="tooltipContent"],
					${BDFDB.dotCN._serverdetailstooltip} > div {
						max-width: unset !important;
						width: 100% !important;
					}
				`;
			}
			
			onStart () {
				initWebpackAndSubscribe();
				this.forceUpdateAll();
			}
			
			onStop () {
				unsubscribeDispatcher();
				this.forceUpdateAll();
				
				BDFDB.DOMUtils.removeLocalStyle(this.name + "TooltipWidth");
			}
			
			forceUpdateAll () {				
				BDFDB.DOMUtils.appendLocalStyle(this.name + "TooltipWidth", `
					${BDFDB.dotCN._serverdetailstooltip} {
						min-width: unset !important;
						width: max-content !important;
						max-width: 250px !important;
					}
					${BDFDB.dotCN._serverdetailstooltip} [class*="tooltipContent"],
					${BDFDB.dotCN._serverdetailstooltip} > div {
						max-width: unset !important;
						width: 100% !important;
					}
				`);
				
				BDFDB.DiscordUtils.rerenderAll();
			}
			
			processGuildItem (e) {
				if (!e.instance.props.guild) return;
				if (!BDFDB.GuildUtils.is(e.instance.props.guild)) return;
				let tooltipContainer;
				e.returnvalue.props.children[1] = BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TooltipContainer, Object.assign({}, e.returnvalue.props, {
					ref: instance => {if (instance) tooltipContainer = instance;},
					tooltipConfig:  Object.assign({
						backgroundColor: this.settings.colors.tooltipColor
					}, e.returnvalue.props.children[1].props.tooltipConfig, {
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

			setLabelsByLanguage () {
				return {
					boosts: "Бустеры",
					creation_date: "Дата создания",
					icon: "Икона",
					join_date: "Дате вступления"
				};
			}
		};
	})(window.BDFDB_Global.PluginUtils.buildPlugin(changeLog));
})();
