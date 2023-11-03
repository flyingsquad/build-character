/**	Build a character
 */
 
export class BuildCharacter {
	actor = null;
	dlg = null;
	itemData = {};

	racialBonus = {
	  Strength: 0,
	  Dexterity: 0,
	  Constitution: 0,
	  Intelligence: 0,
	  Wisdom: 0,
	  Charisma: 0,
	};

	setAbilityBonuses(r) {
		let info = "";
		for (const [key, value] of Object.entries(r.obj.abilities)) {
			switch (key) {
			case 'description':
				info = `<strong>${r.name}</strong> ${value}`;
				break;
			default:
				this.racialBonus[key] += value;
				break;
			}
		}
		return info;
	}
	
	async readItemData() {
		this.itemData.races = [];
		this.itemData.subraces = [];
		this.itemData.subclasses = [];
		this.itemData.classes = [];
		this.itemData.backgrounds = [];
		this.itemData.customLanguages = [];
		this.itemData.customText = {};
		
		let fileNames = game.settings.get('build-character', 'datafiles').split(/; */);
		
		// Don't add duplicate entries. User can override definitions by placing their
		// custom file first in the datafiles setting.

		for (let file of fileNames) {
			let response = await fetch(file);
			if (!response.ok) {
				ui.notifications.warn(`Unable to read character build data file ${file}`);
				continue;
			}
		
			let json = await response.text();
			let data;
			try {
				data = JSON.parse(json);
			} catch (msg) {
				console.log(`JSON format error: ${msg}.` );
				ui.notifications.warn(`JSON format error: ${msg}.`);
			}
			
			function additems(itemData, list) {
				if (list !== undefined) {
					for (const obj of list) {
						const entry = itemData.find( (r) => r.name == obj.name);
						if (entry === undefined)
							itemData.push(obj);
					}
				}
			}
			additems(this.itemData.races, data.races);
			additems(this.itemData.subraces, data.subraces);
			additems(this.itemData.classes, data.classes);
			additems(this.itemData.subclasses, data.subclasses);
			additems(this.itemData.backgrounds, data.backgrounds);
			if (data.customLanguages !== undefined) {
				for (let lang of data.customLanguages)
					this.itemData.customLanguages.push(lang);
			}
			if (data.exclusions && this.itemData.exclusions === undefined)
				this.itemData.exclusions = data.exclusions;
			if (data.customText) {
				Object.keys(data.customText).forEach((t) => {
					this.itemData.customText[t] = data.customText[t];
				});
			}
		}
	}
	
	calcCost(html) {
		let usedPoints = 0;
		for (const ability in this.abilities) {
		  const baseValue = parseInt(html.find(`#${ability}`).val());
		  const racialBonus = parseInt(html.find(`[name="racial${ability}"]`).val());
		  const newValue = baseValue + racialBonus;
		  usedPoints += this.pointCosts[baseValue];
		  html.find(`#total${ability}`).text(newValue);
		  this.abilities[ability] = newValue;
		}
		html.find("#remainingPoints").text(this.totalPoints - usedPoints);
		return usedPoints;
	}
	
	genSelect(ability, total) {
		let value = total - this.racialBonus[ability];
		let content = `<tr>
		<td style="text-align: left">
			<label for="${ability}">${ability}</label>
		</td>
		<td style="text-align: center">
			<select id="${ability}">`;
		for (let i = 8; i <= 15; i++) {
			if (value == i)
				content += `<option value="${i}" selected>${i}</option>`;
			else
				content += `<option value="${i}">${i}</option>`;
		}
		return content + `</select>
			</td>
			<td width="20" style="text-align: center">
				<input type="number" name="racial${ability}" value="${this.racialBonus[ability]}" width="20" size=1 maxlength=1>
			</td>
			<td style="text-align: center; font-weight: bold" id="total${ability}">
				${total}
			</td>
			</tr>
		`;
	}

	pointCosts = {
	  8: 0,
	  9: 1,
	  10: 2,
	  11: 3,
	  12: 4,
	  13: 5,
	  14: 7,
	  15: 9,
	};

	abilities = {
	  Strength: 8,
	  Dexterity: 8,
	  Constitution: 8,
	  Intelligence: 8,
	  Wisdom: 8,
	  Charisma: 8,
	};

	totalPoints = Number(game.settings.get('build-character', 'budget'));

	async addItems(actor, itemList) {
		for (let it of itemList) {
			const item = await fromUuid(it.uuid);
			if (item) {
				// FIX: should use call that executes advancement steps.
				actor.createEmbeddedDocuments("Item", [item]);
				if (it.obj.features !== undefined) {
					for (let f of it.obj.features) {
						const feature = await fromUuid(f.uuid);
						if (feature)
							actor.createEmbeddedDocuments("Item", [feature]);
						else
							throw new Error(`Unable to add feature ${f.name} for ${it.name}`);
					}
				}
			} else {
				const msg = `Could not get item ${it.name} (${it.uuid})`
				throw new Error(msg);
			}
		}
	}

	async buildCharacter(actor) {
		await this.readItemData();

		this.actor = actor;

		let hasBackground = actor.items.find(it => it.type == 'background');
		let hasRace = actor.items.find(it => {
				if (it.type == 'feat')
					return this.itemData.races.find(r => it.name == r.name);
				return false;
			}
		);
		if (actor.system.details.level > 0 || hasBackground || hasRace) {
			Dialog.prompt({
				title: "Not Starting Character",
				content: `<p>Only starting characters may use the character builder.</p>
				<p>${actor.name} has a background, race or class.</p>`,
				label: "OK"
			});
			return false;
		}
		
		let chosenRace = await this.getRace(actor);
		if (!chosenRace)
			return;

		// This will be null if there is no subrace available, undefined if
		// user exited.

		let chosenSubrace = await this.getSubrace(actor, chosenRace[0].name);
		if (chosenSubrace === undefined)
			return;
		
		let chosenBackground = await this.getBackground(actor);
		if (!chosenBackground)
			return;

		let result = await this.pointBuy(actor, chosenRace[0], chosenSubrace[0]);
		if (!result)
			return;

		let chosenClass = await this.getClass(actor);
		if (!chosenClass)
			return;
		let chosenSubclass = await this.getSubclass(actor, chosenClass[0].name);
		if (!chosenSubclass)
			return;

		await this.addItems(actor, chosenRace);
		await this.addItems(actor, chosenSubrace);
		await this.addItems(actor, chosenBackground);
		await this.addItems(actor, chosenSubclass);
		await this.addItems(actor, chosenClass);
	}
	
	choiceContent(choices, limit, description) {
		let content = `<style>
			desc: {
				font-size: 11px;
			}
			choice: {
				font-family: "Modesto Condensed", "Palatino Linotype", serif;
				font-size: 20px;
				font-weight: 700;
			}
			.vcenter {
				align-items: center;
				display: flex;
			}
		</style>\n`;
		if (description)
			content = `<div class="desc">${description}</div>`;
		
		if (limit) {
			content += `<p class="modesto">Choice <span id="count">0</span> of <span id="limit">${limit}</span></p>`;
		}
		
		content += `<div style="padding-bottom: 12px">`;

		choices.sort(function(a, b) {
			return a.name.localeCompare(b.name);
		});
		let i = 0;
		for (const r of choices) {
			content += `<div class="vcenter"><input type="checkbox" id="${i}" name="c${i}" value="${r.uuid}"></input><label for="c${i}"><a class="control showuuid" uuid="${r.uuid}">${r.name}</a></label></div>\n`;
			i++;
		}

		content += `</div>`;
		return content;
	}
	
	
	handleChoiceRender(pb, html) {
		html.on('change', html, (e) => {
			// Limit number of checked items, handle clicking items to show compendium data.
			let html = e.data;
			switch (e.target.nodeName) {
			case 'INPUT':
				let lim = html.find("#limit");
				let limit = lim[0].innerText;
				limit = parseInt(limit);
				let cnt = html.find("#count");
				let count = parseInt(cnt[0].innerText);
				if (e.target.checked)
					count++;
				else
					count--;
				if (count > 1) {
					e.target.checked = false;
					count--;
				}
				cnt.text(count);
				break;
			}
		});
		html.on("click", ".showuuid", async (event) => {
			// Open the window for the item whose UUID was clicked.
			event.preventDefault();
			const uuid = event.currentTarget.getAttribute("uuid");
			if (!uuid) return;
			const item = await fromUuid(uuid);
			if (item) {
				item.sheet.render(true);
			}
		});
	}

	getChoices(html, choices) {
		let selections = [];
		for (let i = 0; i < choices.length; i++) {
			let cb = html.find(`#${i}`);
			if (cb[0].checked)
				selections.push(choices[i]);
		}
		return selections;
	}
	
	async getRace(actor) {
		let races = [];

		for (const pack of game.packs) {
			if (pack.metadata.type === 'Item') {
				for (let race of this.itemData.races) {
					let r = pack.index.find((obj) => obj.type == 'feat' && race.name == obj.name);
					if (r) {
						let include = this.itemData.exclusions.races.findIndex((r) => r == race.name) < 0;
						if (include) races.push(
							{
								name: r.name,
								pack: pack.metadata.id,
								obj: race,
								uuid: r.uuid
							}
						);
					}
				}
			}
		}

		let title = "Select Race";
		if (this.itemData?.customText?.race?.title)
			title = this.itemData.customText.race.title;

		let description = "Select your character's race.";
		if (this.itemData?.customText?.race?.description)
			description = this.itemData.customText.race.description;

		let content = this.choiceContent(races, 1, description);
		let chosenRace = undefined;
		let result = await Dialog.wait({
		  title: title,
		  content: content,
		  buttons: {
			ok: {
			  label: "OK",
			  icon: '<i class="fas fa-angles-right"></i>',
			  callback: async (html) => {
				  chosenRace = this.getChoices(html, races);
				  return true;
			  },
			},
			cancel: {
				label: "Cancel",
				callback: (html) => { return false; }
			},
		  },
		  default: "ok",
		  render: (html) => { this.handleChoiceRender(this, html); }
		});
		return chosenRace;		
	}

	async getSubrace(actor, race) {
		let subraces = [];

		for (const pack of game.packs) {
			if (pack.metadata.type === 'Item') {
				for (let subrace of this.itemData.subraces) {
					if (subrace.race != race)
						continue;
					let r = pack.index.find((obj) => obj.type == 'feat' && subrace.name == obj.name);
					if (r) {
						let include = this.itemData.exclusions.races.findIndex((r) => r == subrace.name) < 0;
						if (include) subraces.push(
							{
								name: r.name,
								pack: pack.metadata.id,
								obj: subrace,
								uuid: r.uuid
							}
						);
					}
				}
			}
		}

		if (subraces.length == 0)
			return null;
		if (subraces.length == 1)
			return subraces;

		let title = "Select Subrace";
		if (this.itemData?.customText?.subrace?.title)
			title = this.itemData.customText.subrace.title;

		let description = "Select your character's subrace.";
		if (this.itemData?.customText?.subrace?.description)
			description = this.itemData.customText.subrace.description;

		let content = this.choiceContent(subraces, 1, description);
		let chosenSubrace = undefined;
		let result = await Dialog.wait({
		  title: title,
		  content: content,
		  buttons: {
			ok: {
			  label: "OK",
			  icon: '<i class="fas fa-angles-right"></i>',
			  callback: async (html) => {
				  chosenSubrace = this.getChoices(html, subraces);
				  return true;
			  },
			},
			cancel: {
				label: "Cancel",
				callback: (html) => { return false; }
			},
		  },
		  default: "ok",
		  render: (html) => { this.handleChoiceRender(this, html); }
		});
		return chosenSubrace;		
	}
	
	async getBackground(actor) {
		// List all the backgrounds found.

		let bgs = [];

		for (const pack of game.packs) {
			if (pack.metadata.type === 'Item') {
				for (let bg of this.itemData.backgrounds) {
					let b = pack.index.find((obj) => obj.type == 'background' && bg.name == obj.name);
					if (b) {
						let exclude = false;
						if (this.itemData?.exclusions?.backgrounds !== undefined)
							exclude = this.itemData.exclusions.backgrounds.findIndex((b) => b == bg.name);
						if (!exclude) bgs.push(
							{
								name: b.name,
								pack: pack.metadata.id,
								obj: bg,
								uuid: b.uuid
							}
						);
					}
				}
			}
		}

		let title = "Select Background";
		if (this.itemData?.customText?.background?.title)
			title = this.itemData.customText.background.title;

		let description = "Select your character's background.";
		if (this.itemData?.customText?.background?.description)
			description = this.itemData.customText.background.description;

		let content = this.choiceContent(bgs, 1, description);
		let chosenBackground = undefined;
		let result = await Dialog.wait({
		  title: title,
		  content: content,
		  buttons: {
			ok: {
			  label: "OK",
			  icon: '<i class="fas fa-angles-right"></i>',
			  callback: async (html) => {
				  chosenBackground = this.getChoices(html, bgs);
				  return true;
			  },
			},
			cancel: {
				label: "Cancel",
				callback: (html) => { return false; }
			},
		  },
		  default: "ok",
		  render: (html) => { this.handleChoiceRender(this, html); }
		});
		return chosenBackground;		
	}

	async getClass(actor) {
		let classes = [];

		for (const pack of game.packs) {
			if (pack.metadata.type === 'Item') {
				for (let cls of this.itemData.classes) {
					let c = pack.index.find((obj) => obj.type == 'class' && cls.name == obj.name);
					if (c) {
						let include = this.itemData.exclusions.classes.findIndex((r) => r == cls.name) < 0;
						if (include) classes.push(
							{
								name: c.name,
								pack: pack.metadata.id,
								obj: cls,
								uuid: c.uuid
							}
						);
					}
				}
			}
		}

		let title = "Select Class";
		if (this.itemData?.customText?.class?.title)
			title = this.itemData.customText.class.title;

		let description = "Select your character's class.";
		if (this.itemData?.customText?.class?.description)
			description = this.itemData.customText.class.description;

		let content = this.choiceContent(classes, 1, description);
		let chosenClass = undefined;
		let result = await Dialog.wait({
		  title: title,
		  content: content,
		  buttons: {
			ok: {
			  label: "OK",
			  icon: '<i class="fas fa-angles-right"></i>',
			  callback: async (html) => {
				  chosenClass  = this.getChoices(html, classes);
				  return true;
			  },
			},
			cancel: {
				label: "Cancel",
				callback: (html) => { return false; }
			},
		  },
		  default: "ok",
		  render: (html) => { this.handleChoiceRender(this, html); }
		});
		return chosenClass;		
	}

	async getSubclass(actor, cls) {
		let subclasses = [];

		for (const pack of game.packs) {
			if (pack.metadata.type === 'Item') {
				for (let subclass of this.itemData.subclasses) {
					if (subclass.class != cls)
						continue;
					let s = pack.index.find((obj) => obj.type == 'subclass' && subclass.name == obj.name);
					if (s) {
						let include = this.itemData.exclusions.subclasses.findIndex((s) => s == subclass.name) < 0;
						if (include) subclasses.push(
							{
								name: s.name,
								pack: pack.metadata.id,
								obj: subclass,
								uuid: s.uuid
							}
						);
					}
				}
			}
		}

		if (subclasses.length == 0)
			return null;
		if (subclasses.length == 1)
			return subclasses;

		let title = "Select Subclass";
		if (this.itemData?.customText?.subclass?.title)
			title = this.itemData.customText.subclass.title;

		let description = "Select your character's subclass.";
		if (this.itemData?.customText?.subclass?.description)
			description = this.itemData.customText.subclass.description;

		let content = this.choiceContent(subclasses, 1, description);
		let chosenSubclass = undefined;
		let result = await Dialog.wait({
		  title: title,
		  content: content,
		  buttons: {
			ok: {
			  label: "OK",
			  icon: '<i class="fas fa-angles-right"></i>',
			  callback: async (html) => {
				  chosenSubclass = this.getChoices(html, subclasses);
				  return true;
			  },
			},
			cancel: {
				label: "Cancel",
				callback: (html) => { return false; }
			},
		  },
		  default: "ok",
		  render: (html) => { this.handleChoiceRender(this, html); }
		});
		return chosenSubclass;		
	}

	async pointBuy(actor, race, subrace) {
		let choose = this.setAbilityBonuses(race);
		if (subrace) {
			let info = this.setAbilityBonuses(subrace);
			if (info)
				choose += "<br>" + info;
		}

		let prepend = '';

		this.abilities['Strength'] = actor.system.abilities.str.value;
		this.abilities['Dexterity'] = actor.system.abilities.dex.value;
		this.abilities['Constitution'] = actor.system.abilities.con.value;
		this.abilities['Intelligence'] = actor.system.abilities.int.value;
		this.abilities['Wisdom'] = actor.system.abilities.wis.value;
		this.abilities['Charisma'] = actor.system.abilities.cha.value;

		let strengthStr = this.genSelect('Strength', actor.system.abilities.str.value);
		let dexterityStr = this.genSelect('Dexterity', actor.system.abilities.dex.value);
		let constitutionStr = this.genSelect('Constitution', actor.system.abilities.con.value);
		let intelligenceStr = this.genSelect('Intelligence', actor.system.abilities.int.value);
		let wisdomStr = this.genSelect('Wisdom', actor.system.abilities.wis.value);
		let charismaStr = this.genSelect('Charisma', actor.system.abilities.cha.value);
		
		let content = `<form>
			  <p>Each ability costs a number of points. You have a total of ${this.totalPoints} points to spend. Racial bonuses can reduce the cost of abilities.</p>
			  <p><strong>Ability Costs</strong> 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9</p>`;
		if (this.choose)
			content += `<p>${choose}</p>`;
		content +=
			  `<p>Remaining Points: <span id="remainingPoints">${this.totalPoints}</span></p>
			  <table>
				<tr>
					<th style="text-align: left">Ability</th>
					<th>Base Value</th>
					<th>Racial Bonus</th>
					<th>Ability Total</th>
				</tr>
				${strengthStr}
				${dexterityStr}
				${constitutionStr}
				${intelligenceStr}
				${wisdomStr}
				${charismaStr}
			  </table>
			</form>
		  `;
		
		function handleRender(pb, html) {
			pb.calcCost(html);
			html.on('change', html, (e) => {
				let html = e.data;
				switch (e.target.nodeName) {
				case 'INPUT':
					pb.calcCost(html);
					break;
				case 'SELECT':
					// Dropdown changed.
					pb.calcCost(html);
					break;
				}
			});
		}

		let result = await Dialog.wait({
		  title: "Point Buy Ability Scores",
		  content: content,
		  buttons: {
			ok: {
			  icon: '<i class="fas fa-angles-right"></i>',
			  label: "OK",
			  callback: async (html) => {
				  if (false) {
					// Get the background from dialog and add to character.
					let bg = html.find("#bg").val().split(".");
					if (bg.length === 1)
						throw new Error("No background was selected.");
					let bgid = bg.pop();
					let compname = bg.join(".");
					let pack = game.packs.get(compname);
					await pack.getEntry(bgid).then(item => actor.createOwnedItem(item));
				  }
				let usedPoints = this.calcCost(html);

				// Check if the point allocation is valid

				if (usedPoints == this.totalPoints) {
				  actor.update({"data.abilities.str.value": this.abilities['Strength']});
				  actor.update({"data.abilities.dex.value": this.abilities['Dexterity']});
				  actor.update({"data.abilities.con.value": this.abilities['Constitution']});
				  actor.update({"data.abilities.int.value": this.abilities['Intelligence']});
				  actor.update({"data.abilities.wis.value": this.abilities['Wisdom']});
				  actor.update({"data.abilities.cha.value": this.abilities['Charisma']});

				} else {
				  // Show an error message if the point allocation is invalid
				  throw new Error(`You need to spend exactly ${this.totalPoints} points. You spent ${usedPoints}.`);
				}
				return true;
			  },
			},
			cancel: {
				label: "Cancel",
				callback: (html) => { return false; }
			},
		  },
		  default: "ok",
		  render: (html) => { handleRender(this, html); }
		});
		return result;
	}
	
	finish() {
		// console.log(`build-character | Finished setting abilities for ${this.actor.name}`);
	}

	static {
		// console.log("build-character | Point Buy Calculator character filter loaded.");

		Hooks.on("init", function() {
		  //console.log("build-character | Point Buy Calculator initialized.");
		});

		Hooks.on("ready", function() {
		  //console.log("build-character | Point Buy Calculator ready to accept game data.");
		});

		/*
		Hooks.on("dropActorSheetData", async function(actor, sheet, data) {
		  console.log(`build-character | dropped item on ${actor.name}.`);
		});
		*/

	}
}


/*
 * Create the configuration settings.
 */
Hooks.once('init', async function () {
	game.settings.register('build-character', 'budget', {
	  name: 'Points available for abilities',
	  hint: 'This is the number of points available for buying abilities.',
	  scope: 'client',     // "world" = sync to db, "client" = local storage
	  config: true,       // false if you dont want it to show in module config
	  type: Number,       // Number, Boolean, String, Object
	  default: 27,
	  onChange: value => { // value is the new value of the setting
		//console.log('build-character | budget: ' + value)
	  }
	});
	game.settings.register('build-character', 'datafiles', {
	  name: 'Data files',
	  hint: 'Semicolon-separated list of data files.',
	  scope: 'client',     // "world" = sync to db, "client" = local storage
	  config: true,       // false if you dont want it to show in module config
	  type: String,       // Number, Boolean, String, Object
	  default: "srdData.json",
	  onChange: value => { // value is the new value of the setting
		console.log('build-character | datafiles: ' + value)
	  }
	});
	
});

function insertActorHeaderButtons(actorSheet, buttons) {
  let actor = actorSheet.object;
  buttons.unshift({
    label: "Build Character",
    icon: "fas fa-user-plus",
    class: "build-character-button",
    onclick: async () => {
		let bc = null;
		try {
			bc = new BuildCharacter();
			if (!await bc.buildCharacter(actor))
				return false;
		} catch (msg) {
			ui.notifications.warn(msg);
		} finally {
			if (bc)
				bc.finish();
		}

    }
  });
}

Hooks.on("getActorSheetHeaderButtons", insertActorHeaderButtons);
