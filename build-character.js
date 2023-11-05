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
	  Charisma: 0
	};
	abilityNames = {
	  Strength: 'str',
	  Dexterity: 'dex',
	  Constitution: 'con',
	  Intelligence: 'int',
	  Wisdom: 'wis',
	  Charisma: 'cha'
	};

	setAbilityBonuses(r) {
		let info = "";
		if (r.obj.abilities === undefined)
			return info;

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
	
	/**	Read the JSON files that describe what actions to take for each item.
	 *	These supply data like the skills available, character size, ability
	 *	bonuses for races, darkvision range, etc. The names must match the
	 *	compendium entries exactly.
	 */

	async readItemData() {
		this.itemData.races = [];
		this.itemData.subraces = [];
		this.itemData.subclasses = [];
		this.itemData.classes = [];
		this.itemData.backgrounds = [];
		this.itemData.customLanguages = [];
		this.itemData.customText = {};
		
		let fileNames = [
			game.settings.get('build-character', 'auxdata'),
			game.settings.get('build-character', 'worlddata'),
			game.settings.get('build-character', 'customdata'),
			game.settings.get('build-character', 'maindata')
		];
		
		// Don't add duplicate entries. User can override definitions by placing their
		// custom file first in the datafiles setting.

		for (let file of fileNames) {
			if (!file)
				continue;
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
				const confirmation = await Dialog.prompt({
					content: `<p>${file}</p><p>JSON format error: ${msg}.</p>`
				});
				ui.notifications.warn(`${file}: JSON format error: ${msg}.`);
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

			// Only allow one set of exclusions, which should be included in the
			// first data file listed, usually stored in the world folder.

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
			if (it == null)
				continue;
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

	flexCSS = `<style>
				.container {
					display: flex;
					flex-wrap: nowrap;
					align-items: center;
				}
				.input {
					flex-grow: 4;
				}
				.label {
					flex-grow: 1;
				}
			</style>`;

	async createCharacter() {
		let name = "";
		let result;
		result = await doDialog({
		  title: "Build Character",
		  content: this.flexCSS + `<div class="container">
				<label class="label" for="name">Name&nbsp;&nbsp;</label>
				<input class="input" type="text" id="name" name="name" autofocus>
			</div><br>`,
		  buttons: {
			create: {
			  label: "Create Character",
			  icon: '<i class="fas fa-angles-right"></i>',
			  callback: async (html) => {
				  name = html.find("#name").val();
				  return true;
			  },
			},
			cancel: {
				label: "Cancel",
				callback: (html) => { return false; }
			},
		  },
		  default: "create",
		  render: (html) => {
			  html.find("#name").focus();
			}
		});

		if (!result || !name)
			return false;
		
		let actor = await Actor.create({
		  name: name,
		  type: "character",
		  img: game.settings.get('build-character', 'defaultportrait')
		});
		// FIX: set the default token as well.
		await actor.update({"prototypeToken.texture.src": game.settings.get('build-character', 'defaulttoken')});

		actor.sheet.render(true)
		await this.buildCharacter(actor);
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

		let step = 1;
		let next = 0;
		let chosenRace = undefined;
		let chosenSubrace = undefined;
		let chosenBackground = undefined;
		let chosenClass = undefined;
		let chosenSubclass = undefined;

		for (;;) {
			switch (step) {
			case 1:
				[next, chosenRace] = await this.getRace(actor, chosenRace);
				break;

			case 2:
				// This will be null if there is no subrace available, undefined if
				// user exited. 
				if (next < 0 && chosenSubrace == null)
					;
				else
					[next, chosenSubrace] = await this.getSubrace(actor, chosenRace.name, chosenSubrace);
				break;
			
			case 3:
				[next, chosenBackground] = await this.getBackground(actor, chosenBackground);
				break;
				
			case 4:
				[next, chosenClass] = await this.getClass(actor, chosenClass);
				break;
				
			case 5:
				[next, chosenSubclass] = await this.getSubclass(actor, chosenClass.name, chosenSubclass);
				break;
				
			case 6:
				next = await this.pointBuy(actor, chosenRace, chosenSubrace);
				break;
			}
			if (next == 0)
				return;
			step += next < 0 ? -1 : +1;
			if (step > 6)
				break;
		}

		// Set values on character sheet and allow user to make selections.

		if (chosenSubrace != null)
			actor.update({"data.details.race": chosenSubrace.name});
		else
			actor.update({"data.details.race": chosenRace.name});

		next = await this.chooseSkills(actor, [chosenRace, chosenSubrace, chosenBackground, chosenClass, chosenSubclass]);
		if (!next)
			return;

		await this.addItems(actor, [chosenRace, chosenSubrace, chosenBackground, chosenSubclass]);
		await this.setOtherData(actor, [chosenRace, chosenSubrace, chosenBackground, chosenClass, chosenSubclass]);
		await this.addItems(actor, [chosenClass]);
	}
	
	skillName(key) {
		if (CONFIG.DND5E.skills[key] === undefined)
			return key;
		return CONFIG.DND5E.skills[key].label;
	}

	/**	Set data like saves, darkvision, etc.
	 */

	async setOtherData(actor, features) {
		for (const f of features) {
			if (!f)
				continue;
			if (f.obj.saves !== undefined) {
				for (const save of f.obj.saves)
					actor.update({[`data.abilities.${this.abilityNames[save]}.proficient`]: 1});
			}
			if (f.obj.darkvision) {
				if (actor.system.attributes.senses.darkvision < f.obj.darkvision) {
					actor.update({"data.attributes.senses.darkvision": f.obj.darkvision});
					actor.update({"prototypeToken.sight.range": f.obj.darkvision});
				}
				
			}
			if (f.obj.size) {
				if (actor.system.traits.size != f.obj.size)
					actor.update({"data.traits.size": f.obj.size});
			}
			if (f.obj.speed) {
				if (actor.system.attributes.movement.walk != f.obj.speed)
					actor.update({"data.attributes.movement.walk": f.obj.speed});
			}
			if (f.obj.armor) {
				//let armor = structuredClone(actor.system.traits.armorProf);
				let armor = actor.system.traits.armorProf;
				let changed = false;
				for (let a of f.obj.armor) {
					if (!armor.value.has(a.name)) {
						armor.value.add(a.name);
						changed = true;
					}
				}
				if (changed)
					actor.update({"data.traits.armorProf": armor});
			}
		}
	}

	async chooseSkills(actor, features) {
		// Get the granted skills.
		let grantedSkills = [];
		let choices = [];
		for (const f of features) {
			if (!f || f.obj.skills === undefined)
				continue;
			for (const skill of f.obj.skills) {
				if (skill.name != undefined) {
					// Add this skill to the list granted, but if it's already
					// granted by some other feature, allow the user to pick a
					// replacement for it.

					if (grantedSkills.find(s => s == skill.name)) {
						const skname = this.skillName(skill.name);
						choices.push({choose: 1, reason: `${f.obj.name}: another feature already granted the skill ${skname}. Pick another skill in its place.`});
					} else
						grantedSkills.push(skill.name);
				}
				if (skill.choose != undefined) {
					// User gets to choose some skills.
					choices.push({choose: skill.choose, options: skill.options,
						reason: `Choose skill(s) for ${f.name}`});
				}
			}
		}
		
		if (choices.length > 0) {
			for (const choice of choices) {
				let selected = await this.pickSkills(choice, grantedSkills);
				if (!selected || selected.length == 0)
					return false;
				for (let i = 0; i < selected.length; i++)
					grantedSkills.push(selected[i]);
			}
		}
		
		for (const skill of grantedSkills)
			actor.update({[`data.skills.${skill}.value`]: 1});
		
		return true;
	}
	
	
	async pickSkills(choice, grantedSkills) {
		let allSkills = ["acr", "ani", "arc", "ath", "dec", "his", "ins", "itm", "inv", "med", "nat", "prc", "prf", "per", "rel", "slt", "ste", "sur"];	
		let list = choice.options != undefined ? choice.options : allSkills;
		let skills = [];
		for (let skill of list) {
			if (grantedSkills.find(s => s == skill))
				continue;
			skills.push(
				{name: this.skillName(skill), code: skill}
			);
		}
		let alreadySelected = [];
		for (let s of grantedSkills) {
			alreadySelected.push(this.skillName(s));
		}
		let prompt = `<p>${choice.reason}</p>`;
		if (alreadySelected.length > 0) {
			let str = alreadySelected.join(', ');
			prompt += `<p style="left-margin: .2in">Already selected: ${str}</p>\n`;
		}

		let content = this.choiceContent(skills, choice.choose, prompt);
		let pickedSkills = [];
		let result = await doDialog({
		  title: "Choose Skills",
		  content: content,
		  buttons: {
			ok: {
			  label: "OK",
			  icon: '<i class="fas fa-angles-right"></i>',
			  callback: async (html) => {
				  let chosenSkills = this.getChoices(html, skills);
				  for (let skill of chosenSkills)
					  pickedSkills.push(skill.code);
				  return true;
			  },
			},
			cancel: {
				label: "Cancel",
				callback: (html) => { return null; }
			},
		  },
		  default: "ok",
		  render: (html) => { this.handleChoiceRender(this, html); }
		});
		return pickedSkills;
	}

	choiceContent(choices, limit, description, prechecked) {

		choices.sort(function(a, b) {
			return a.name.localeCompare(b.name);
		});
		
		let choiceText = "";

		let i = 0;
		let count = 0;

		for (const r of choices) {
			let text;
			let checked = "";
			if (prechecked) {
				if (prechecked.find( (c) => c && c.name == r.name)) {
					checked = " checked";
					count++;
				}
			}
			if (r.uuid)
				text = `<div class="vcenter">
					<input class="checkbox" type="checkbox" id="${i}" name="c${i}" value="${r.uuid}"${checked}></input>
					<label class="label" for="c${i}"><a class="control showuuid" uuid="${r.uuid}">${r.name}</a></label>
					</div>\n`;
			else
				text = `<div class="vcenter"><input type="checkbox" id="${i}" name="c${i}" value="${r.code}"${checked}></input>
					<label for="c${i}">${r.name}</label>
				</div>\n`;
			choiceText += text;
			i++;
		}

		let content = `<style>
			desc: {
				font-size: 9px;
			}
			.choices: {
				border-top: 1pt solid;
				border-bottom: 1pt solid;
				border-color: maroon;
			}
			.vcenter {
				align-items: center;
				display: flex;
			}
			.checkbox {
				flex-grow: 1;
			}
			.label {
				flex-grow: 4;
			}
		</style>\n`;
		if (description)
			content += `<div class="desc">${description}</div>`;
		
		if (limit) {
			content += `<p class="modesto choices">Choice <span id="count">${count}</span> of <span id="limit">${limit}</span></p>`;
		}
		
		content += `<div style="padding-bottom: 12px">`;
		content += choiceText;
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
				if (count > limit) {
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
	
	async getRace(actor, prevRace) {
		let races = [];

		for (const pack of game.packs) {
			if (pack.metadata.type === 'Item') {
				for (let race of this.itemData.races) {
					let r = pack.index.find((obj) => obj.type == 'feat' && race.name == obj.name);
					if (r) {
						let include = true;
						if (this.itemData?.exclusions?.races)
							include = this.itemData.exclusions.races.findIndex((r) => r == race.name) < 0;
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

		let content = this.choiceContent(races, 1, description, [prevRace]);
		let chosenRace = undefined;

		let next = await Dialog.wait({
		  title: title,
		  content: content,
		  buttons: {
			next: {
			  label: "Next",
			  icon: '<i class="fas fa-angles-right"></i>',
			  callback: async (html) => {
				  chosenRace = this.getChoices(html, races);
				  return +1;
			  },
			},
			cancel: {
				label: "Cancel",
				callback: (html) => { return 0; }
			},
		  },
		  default: "next",
		  render: (html) => { this.handleChoiceRender(this, html); }
		});

		return [next, chosenRace ? chosenRace[0] : undefined];
	}

	async getSubrace(actor, race, prevSubrace) {
		let subraces = [];

		for (const pack of game.packs) {
			if (pack.metadata.type === 'Item') {
				for (let subrace of this.itemData.subraces) {
					if (subrace.race != race)
						continue;
					let r = pack.index.find((obj) => obj.type == 'feat' && subrace.name == obj.name);
					if (r) {
						let include = true;
						if (this.itemData?.exclusions?.races)
							include = this.itemData.exclusions.races.findIndex((r) => r == subrace.name) < 0;
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
			return [+1, null];

		let title = "Select Subrace";
		if (this.itemData?.customText?.subrace?.title)
			title = this.itemData.customText.subrace.title;

		let description = `Select the subrace for ${race}.`;
		if (this.itemData?.customText?.subrace?.description)
			description = this.itemData.customText.subrace.description;

		let content = this.choiceContent(subraces, 1, description, [prevSubrace]);
		let chosenSubrace = undefined;

		let next = await Dialog.wait({
		  title: title,
		  content: content,
		  buttons: {
			previous: {
				label: "Previous",
				icon: '<i class="fas fa-angles-left"></i>',
				callback: (html) => {
					chosenSubrace = this.getChoices(html, subraces);
					return -1;
				}
			},
			next: {
			  label: "Next",
			  icon: '<i class="fas fa-angles-right"></i>',
			  callback: async (html) => {
				  chosenSubrace = this.getChoices(html, subraces);
				  return +1;
			  },
			},
			cancel: {
				label: "Cancel",
				callback: (html) => { return 0; }
			},
		  },
		  default: "ok",
		  render: (html) => { this.handleChoiceRender(this, html); }
		});
		return [next, chosenSubrace ? chosenSubrace[0] : undefined];
	}
	
	async getBackground(actor, prevBackground) {
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

		let content = this.choiceContent(bgs, 1, description, [prevBackground]);
		let chosenBackground = undefined;

		let next = await Dialog.wait({
		  title: title,
		  content: content,
		  buttons: {
			previous: {
				label: "Previous",
				icon: '<i class="fas fa-angles-left"></i>',
				callback: async (html) => {
				  chosenBackground = this.getChoices(html, bgs);
				  return -1;
				},
			},
			next: {
			  label: "Next",
			  icon: '<i class="fas fa-angles-right"></i>',
			  callback: async (html) => {
				  chosenBackground = this.getChoices(html, bgs);
				  return +1;
			  },
			},
			cancel: {
				label: "Cancel",
				callback: (html) => { return false; }
			},
		  },
		  default: "next",
		  render: (html) => { this.handleChoiceRender(this, html); }
		});
		return [next, chosenBackground ? chosenBackground[0] : undefined];
	}

	async getClass(actor, prevClass) {
		let classes = [];

		for (const pack of game.packs) {
			if (pack.metadata.type === 'Item') {
				for (let cls of this.itemData.classes) {
					let c = pack.index.find((obj) => obj.type == 'class' && cls.name == obj.name);
					if (c) {
						let include = true;
						if (this.itemData?.exclusions?.classes)
							include = this.itemData.exclusions.classes.findIndex((r) => r == cls.name) < 0;
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

		let content = this.choiceContent(classes, 1, description, [prevClass]);
		let chosenClass = undefined;

		let next = await Dialog.wait({
		  title: title,
		  content: content,
		  buttons: {
			previous: {
				label: "Previous",
				icon: '<i class="fas fa-angles-left"></i>',
				callback: async (html) => {
				  chosenClass  = this.getChoices(html, classes);
				  return -1;
				},
			},
			next: {
			  label: "Next",
			  icon: '<i class="fas fa-angles-right"></i>',
			  callback: async (html) => {
				  chosenClass  = this.getChoices(html, classes);
				  return +1;
			  },
			},
			cancel: {
				label: "Cancel",
				callback: (html) => { return 0; }
			},
		  },
		  default: "next",
		  render: (html) => { this.handleChoiceRender(this, html); }
		});
		return [next, chosenClass ? chosenClass[0] : undefined];
	}

	async getSubclass(actor, cls, prevSubclass) {
		let subclasses = [];

		for (const pack of game.packs) {
			if (pack.metadata.type === 'Item') {
				for (let subclass of this.itemData.subclasses) {
					if (subclass.class != cls)
						continue;
					let s = pack.index.find((obj) => obj.type == 'subclass' && subclass.name == obj.name);
					if (s) {
						let include = true;
						if (this.itemData?.exclusions?.subclasses)
							include = this.itemData.exclusions.subclasses.findIndex((s) => s == subclass.name) < 0;
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
			return [+1, null];

		let title = "Select Subclass";
		if (this.itemData?.customText?.subclass?.title)
			title = this.itemData.customText.subclass.title;

		let description = "Select your character's subclass.";
		if (this.itemData?.customText?.subclass?.description)
			description = this.itemData.customText.subclass.description;

		let content = this.choiceContent(subclasses, 1, description, [prevSubclass]);
		let chosenSubclass = undefined;

		let next = await Dialog.wait({
		  title: title,
		  content: content,
		  buttons: {
			previous: {
				label: "Previous",
				icon: '<i class="fas fa-angles-left"></i>',
				callback: async (html) => {
					chosenSubclass = this.getChoices(html, subclasses);
					return -1;
				}
			},
			next: {
			  label: "Next",
			  icon: '<i class="fas fa-angles-right"></i>',
			  callback: async (html) => {
				  chosenSubclass = this.getChoices(html, subclasses);
				  return +1;
			  },
			},
			cancel: {
				label: "Cancel",
				callback: (html) => { return false; }
			},
		  },
		  default: "next",
		  render: (html) => { this.handleChoiceRender(this, html); }
		});
		return [next, chosenSubclass ? chosenSubclass[0] : undefined];
	}

	async pointBuy(actor, race, subrace) {
		this.racialBonus.Strength = 0;
		this.racialBonus.Dexterity = 0;
		this.racialBonus.Constitution = 0;
		this.racialBonus.Intelligence = 0;
		this.racialBonus.Wisdom = 0;
		this.racialBonus.Charisma = 0;

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
		if (choose)
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
		
		function recordAbilities(pb) {
			actor.update({"data.abilities.str.value": pb.abilities['Strength']});
			actor.update({"data.abilities.dex.value": pb.abilities['Dexterity']});
			actor.update({"data.abilities.con.value": pb.abilities['Constitution']});
			actor.update({"data.abilities.int.value": pb.abilities['Intelligence']});
			actor.update({"data.abilities.wis.value": pb.abilities['Wisdom']});
			actor.update({"data.abilities.cha.value": pb.abilities['Charisma']});
		}
		
		function setAbilities(pb, html) {
			let usedPoints = pb.calcCost(html);

			// Check if the point allocation is valid

			if (usedPoints == pb.totalPoints) {
				recordAbilities(pb);
			} else {
				// Show an error message if the point allocation is invalid
				throw new Error(`You need to spend exactly ${pb.totalPoints} points. You spent ${usedPoints}.`);
			}
		}

		let next = await Dialog.wait({
		  title: "Point Buy Ability Scores",
		  content: content,
		  buttons: {
			previous: {
			  icon: '<i class="fas fa-angles-left"></i>',
			  label: "Previous",
			  callback: async (html) => {
				  let usedPoints = this.calcCost(html);
				  recordAbilities(this);
				  return -1;
			  },
			},
			next: {
			  icon: '<i class="fas fa-angles-right"></i>',
			  label: "Next",
			  callback: async (html) => {
				  setAbilities(this, html);
				  return +1;
			  },
			},
			cancel: {
				label: "Cancel",
				callback: (html) => { return 0; }
			},
		  },
		  default: "next",
		  render: (html) => { handleRender(this, html); }
		});
		return next;
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
		Hooks.on("postCreateEmbeddedData", async function(actor, sheet, data) {
		  console.log(`build-character | postCreateEmbeddedData ${actor.name}.`);
		});
		Hooks.on("createItem", async function(actor, sheet, data) {
		  console.log(`build-character | createItem ${actor.name}.`);
		});

	}
}

async function doDialog(dlg, msg) {
	let result;
	try {
		result = await Dialog.wait(dlg);
	} catch (m) {
		ui.notifications.warn(msg);
		return false;
	}
	return result;
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

	game.settings.register('build-character', 'maindata', {
	  name: 'Main Data File',
	  hint: 'Contains base definitions for items from the SRD.',
	  config: true,
	  type: String,
	  filePicker: true,
	  default: "modules/build-character/srdData.json",
	});

	game.settings.register('build-character', 'customdata', {
	  name: 'Custom Data File',
	  hint: 'Definitions for any custom data, such as PHB or homebrew items.',
	  config: true,
	  type: String,
	  filePicker: true,
	  default: ""
	});

	game.settings.register('build-character', 'worlddata', {
	  name: 'World Data File',
	  hint: 'Definitions for world data. Specify exclusions in this file to exclude items from the SRD.',
	  config: true,
	  type: String,
	  filePicker: true,
	  default: ""
	});

	game.settings.register('build-character', 'auxdata', {
	  name: 'Auxiliary Data File',
	  hint: 'Definitions for any other auxiliary items. Specify exclusions in this file to exclude items from the SRD.',
	  config: true,
	  type: String,
	  filePicker: true,
	  default: ""
	});

	let defPortrait = 'icons/svg/mystery-man.svg';
	game.settings.register('build-character', 'defaultportrait', {
	  name: 'Default portrait',
	  hint: 'Name of the image file used as the portrait for new characters.',
	  scope: 'client',     // "world" = sync to db, "client" = local storage
	  config: true,       // false if you dont want it to show in module config
	  type: String,       // Number, Boolean, String, Object
	  default: defPortrait,
	  filePicker: true,
	  onChange: value => { // value is the new value of the setting
		console.log('build-character | portrait: ' + value)
	  },
	});
	let defToken = 'icons/svg/mystery-man.svg';
	game.settings.register('build-character', 'defaulttoken', {
	  name: 'Default taken',
	  hint: 'Name of the image file used as the token for new characters.',
	  scope: 'client',     // "world" = sync to db, "client" = local storage
	  config: true,       // false if you dont want it to show in module config
	  type: String,       // Number, Boolean, String, Object
	  default: defToken,
	  filePicker: true,
	  onChange: value => { // value is the new value of the setting
		console.log('build-character | token: ' + value)
	  },
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

function hasPermission() {
    const userRole = game.user.role;

    if (!game.permissions.ACTOR_CREATE.includes(userRole))
        return false;
	return true;
}

// Put button on actor tab.

Hooks.on("renderActorDirectory", (app, html, data) => {
    console.log("build-character | Creating actor tab button");
	if (!hasPermission())
		return;

    const createButton = $("<button id='build-character-button'><i class='fas fa-user-plus'></i> Build Character</button>");
    html.find(".directory-header").append(createButton);

    createButton.click(async (ev) => {
        console.log("build-character | button clicked");
		let bc;
		try {
			if (hasPermission()) {
				bc = new BuildCharacter();
				await bc.createCharacter();
			}
		} catch (msg) {
			ui.notifications.warn(msg);
		} finally {
			if (bc)
				bc.finish();
		}
    });
});
