/**	Build a character
 */

export class BuildCharacter {
	bcVersion = 1;

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

		if (BuildCharacter.itemData) {
			// Data already cached.
			this.itemData = BuildCharacter.itemData;
			return;
		}
		
		this.itemData.races = [];
		this.itemData.subraces = [];
		this.itemData.subclasses = [];
		this.itemData.classes = [];
		this.itemData.backgrounds = [];
		this.itemData.customLanguages = [];
		this.itemData.customText = {};
		this.itemData.spells = [];
		this.itemData.categories = [];
		
		// Don't add duplicate entries. User can override definitions by placing their
		// custom file first in the datafiles setting.

		let fileNames = [];

		for (const setting of ['auxdata', 'worlddata', 'customdata', 'maindata']) {
			const fileName = game.settings.get('build-character', setting);
			if (fileName)
				fileNames.push(fileName);
		}

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
			
			function addspells(itemData, list) {
				function addMissing(lev, obj) {
					for (let s of obj.spells) {
						if (!lev.spells.includes(s))
							lev.spells.push(s);
					}
				}

				if (list) {
					for (const obj of list) {
						if (obj.level) {
							let lev = itemData.find((v) => v.level == obj.level);
							if (lev) {
								addMissing(lev, obj);
							} else {
								itemData.push(obj);
							}
						} else if (obj.class) {
							let lev = itemData.find((v) => v.class  == obj.class);
							if (lev) {
								addMissing(lev, obj);
							} else {
								itemData.push(obj);
							}
						} else if (obj.school) {
							let school = itemData.find((v) => v.school  == obj.school);
							if (school) {
								addMissing(school, obj);
							} else {
								itemData.push(obj);
							}
						}
					}
				}
			}

			additems(this.itemData.races, data.races);
			additems(this.itemData.subraces, data.subraces);
			additems(this.itemData.classes, data.classes);
			additems(this.itemData.subclasses, data.subclasses);
			additems(this.itemData.backgrounds, data.backgrounds);
			addspells(this.itemData.spells, data.spells);
			if (data.customLanguages !== undefined) {
				for (let lang of data.customLanguages)
					this.itemData.customLanguages.push(lang);
			}

			if (data.categories) {
				for (const cat of data.categories) {
					if (!this.itemData[cat])
						this.itemData[cat] = [];
					if (this.itemData.categories.findIndex(c => c == cat) < 0)
						this.itemData.categories.push(cat);
				}
			}
			
			for (const cat of this.itemData.categories) {
				if (data[cat]) {
					for (const entry of data[cat])
						this.itemData[cat].push(entry);
				}
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
		BuildCharacter.itemData = this.itemData;
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
		html.find("#curTotal").text(usedPoints);
		return usedPoints;
	}
	
	genSelect(ability, total) {
		let value = total - this.racialBonus[ability];
		let content = `<tr>
		<td style="text-align: left">
			<label for="${ability}">${ability}</label>
		</td>
		<td width="80px" style="text-align: center">`;
		
		if (this.abilityMethod == 'pointbuy') {
			content += `<select id="${ability}">`;
			for (let i = 8; i <= 15; i++) {
				if (value == i)
					content += `<option value="${i}" selected>${i}</option>`;
				else
					content += `<option value="${i}">${i}</option>`;
			}
			content += `</select>`;
		} else {
			content += `<input type="number" id="${ability}" name="${ability}" value="${value}">`;
		}

		return content += `</td>
			<td width="80" style="text-align: center">
				<input type="number" name="racial${ability}" value="${this.racialBonus[ability]}">
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
	abilityMethod = game.settings.get('build-character', 'abilityMethod');

	async addFeatures(srcItem, actor, it) {
		
		let addedFeatureIDs = [];
		
		async function chooseFeatures(bc, f) {
			let items = [];
			if (f.category) {
				if (bc.itemData[f.category]) {
					for (let it of bc.itemData[f.category]) {
						let name = it.name;
						for (const pack of game.packs) {
							if (pack.metadata.type === 'Item') {
								let entry = pack.index.find(e => name == e.name);
								if (entry) {
									items.push({name: name, uuid: entry.uuid});
								}
							}
						}
					}
				}
			} else if (f.choices) {
				for (let it of f.choices) {
					items.push({name: it.name, uuid: it.uuid});
				}
			}
			
			if (items.length <= 0)
				return;

			let content = bc.choiceContent(items, f.choose, `Make a selection for ${it.name}`);
			let pickedItems = [];
			let result = await doDialog({
			  title: "Choose Items",
			  content: content,
			  buttons: {
				ok: {
				  label: "Next",
				  icon: '<i class="fas fa-angles-right"></i>',
				  callback: async (html) => {
					  pickedItems = bc.getChoices(html, items);
					  return true;
				  },
				},
				cancel: {
					label: "Cancel",
					callback: (html) => { return false; }
				},
			  },
			  default: "ok",
			  close: () => { return false; },
			  render: (html) => { bc.handleChoiceRender(this, html); }
			}, "", {width: 600});
			if (result) {
				for (const item of pickedItems) {
					await createItem(item);
				}
			}
		}
		
		async function createItem(f) {
			const feature = await fromUuid(f.uuid);
			if (!feature)
				throw new Error(`Feature ${f.name}[${f.uuid}] for ${it.name} not found in compendium`);
			let itemData = feature.toObject();
			let ids = await actor.createEmbeddedDocuments("Item", [itemData]);
			if (ids) {
				addedFeatureIDs.push(ids[0]._id);
				f.id = ids[0];
			}
		}


		if (it.obj.features !== undefined) {
			for (let f of it.obj.features) {
				if (f.uuid) {
					await createItem(f);
				} else if (f.choose) {
					await chooseFeatures(this, f);
				}
			}
			if (addedFeatureIDs.length > 0)
				await actor.updateEmbeddedDocuments("Item",
					[{ "_id": srcItem._id, "flags.build-character.features": addedFeatureIDs }]
				);
		}
	}

	skillName(key) {
		return dnd5e.documents.Trait.keyLabel("skills", key);
	}

	langName(key) {
		return dnd5e.documents.Trait.keyLabel("languages", key);
	}

	getWeaponName(key) {
		return dnd5e.documents.Trait.keyLabel("weapon", key);		
	}
	
	abilityName(key) {
		return CONFIG.DND5E.abilities[key].label;
	}

	/**	Set data like saves, darkvision, etc.
	 */

	async setData(srcItem, actor, features) {

		let bc = this;

		async function chooseProfs(source, item, trait, profs, custom, added, addedCustom) {
			let choices = [];
			let alreadyHave = [];
			let itemType;
			if (trait == 'languages') {
				itemType = item.choose > 1 ? 'languages' : 'language';
				for (let lang of Object.keys(CONFIG.DND5E.languages)) {
					if (profs.findIndex(l => l == lang) >= 0)
						alreadyHave.push(bc.langName(lang));
					else
						choices.push({name: bc.langName(lang), key: lang});
				}
				if (custom.length > 0)
					alreadyHave = alreadyHave.concat(custom);
				for (let lang of bc.itemData.customLanguages) {
					if (alreadyHave.findIndex(l => l == lang) < 0) {
						choices.push({name: lang, key: lang, custom: true});
					}
				}
			} else if (trait == 'weaponProf') {
				itemType = item.choose > 1 ? 'weapons' : 'weapon';
				for (let weapon of actor.system.traits[trait].value)
					alreadyHave.push(bc.getWeaponName(weapon));
				if (item.choices) {
					for (let c of item.choices) {
						if (!actor.system.traits[trait].value.has(c))
							choices.push({name: bc.getWeaponName(c), key: c});
					}
				} else {
					for (let weap of Object.keys(CONFIG.DND5E.weaponIds)) {
						if (!actor.system.traits[trait].value.has(weap))
							choices.push({name: bc.getWeaponName(weap), key: weap});
					}
				}
			}

			let prompt = `<p>Choose ${item.choose} ${itemType} for ${source}.</p>`;
			
			if (alreadyHave.length || custom.length) {
				let str = alreadyHave.join(', ');
				prompt += `<p>You already have the following ${itemType}: ${str}</p>`;
			}

			let content = bc.choiceContent(choices, item.choose, prompt);
			content += `<p><label for="custom" style="flex-grow: 1">Custom ${trait} (separate with semicolons): </label><br>
				<input type="text" name="custom" id="custom" style="flex-grow: 1"></p>`;

			let result = await doDialog({
			  title: `Choose ${trait}`,
			  content: content,
			  buttons: {
				ok: {
				  label: "Next",
				  icon: '<i class="fas fa-angles-right"></i>',
				  callback: async (html) => {
					  let chosenItems = bc.getChoices(html, choices);
					  for (let it of chosenItems) {
						  if (it.custom) {
							  custom.push(it.key);
							  addedCustom.push(it.key);
						  } else {
							  profs.push(it.key);
							  added.push(it.key);
						  }
					  }
					  let cust = html.find("#custom").val();
					  if (cust)
						  for (let lang of cust.split(/; */)) {
							  custom.push(lang);
							  addedCustom.push(lang);
						  }
					  return true;
				  }
				},
				cancel: {
					label: "Cancel",
					callback: (html) => { return false; }
				}
			  },
			  default: "ok",
			  close: () => { return false; },
			  render: (html) => { bc.handleChoiceRender(bc, html); }
			}, "", {width: 600});
			if (!result)
				throw 'cancel';
		}

		async function addProfs(source, list, trait) {
			if (!list)
				return;
			let profs = [];
			let added = [];
			let addedCustom = [];

			for (const p of actor.system.traits[trait].value)
				profs.push(p);
			let custom = [];
			if (actor.system.traits[trait].custom)
				custom = actor.system.traits[trait].custom.split(/; */);
			for (const item of list) {
				if (item.name) {
					profs.push(item.name);
					added.push(item.name);
				} else if (item.choose)
					await chooseProfs(source, item, trait, profs, custom, added, addedCustom);
				else if (item.custom) {
					custom.push(item.custom);
					addedCustom.push(item.custom);
				}
			}
			if (added.length > 0) {
				actor.update({[`system.traits.${trait}.value`]: profs});
				await actor.updateEmbeddedDocuments("Item",
					[{ "_id": srcItem._id, [`flags.build-character.traits.${trait}`]: added }]
				);
			}
			if (custom.length) {
				actor.update({[`system.traits.${trait}.custom`]: custom.join(';')});
				await actor.updateEmbeddedDocuments("Item",
					[{ "_id": srcItem._id, [`flags.build-character.custom.${trait}`]: addedCustom }]
				);
			}
		}
		
		function getItemName(id) {
			let pack = game.packs.get(CONFIG.DND5E.sourcePacks.ITEMS);
			if (pack) {
				let item = pack.index.get(id);
				if (item)
					return item.name;
			}
			return null;
		}
		
		function getToolName(key) {
			return dnd5e.documents.Trait.keyLabel("tool", key);		
		}

		async function chooseTools(item, addedTools) {
			let choices = [];
			let alreadyHave = [];

			for (let tool in actor.system.tools)
				alreadyHave.push(getToolName(tool));

			if (item.choices) {
				for (let c of item.choices) {
					let name = getToolName(c);
					if (!(c in actor.system.tools))
						choices.push({name: name, key: c});
				}
			}

			prompt = `<p>Select ${item.choose} tool(s).</p>`;
			if (alreadyHave.length > 0)
				prompt += "<p>Already selected: " + alreadyHave.join(', ') + "</p>";
			
			if (item.category) {
				let list = [];
				for (let cat of item.category) {
					switch (cat) {
					case 'art':
						list = list.concat(['alchemist', 'brewer', 'calligrapher', 'carpenter', 'cartographer', 'cobbler', 'cook', 'glassblower', 'jeweler', 'leatherworker', 'mason', 'painter', 'smith', 'tinker', 'weaver', 'woodcarver']);
						break;
					case 'music':
						list = list.concat(['bagpipes', 'drum', 'flute', 'horn', 'lute', 'lyre', 'panflute', 'shawm', 'viol']);
						break;
					case 'game':
						list = list.concat(['chess', 'card', 'dice']);
						break;
					case 'vehicle':
						list = list.concat(['land', 'water', 'air', 'space']);
						break;
					}
				}
				for (let tool of list)
					choices.push({name: getToolName(tool), key: tool});
			}
			
			if (choices.length == 0) {
				for (let tool of Object.keys(CONFIG.DND5E.toolIds)) {
					choices.push({name: getToolName(tool), key: tool});
				}
				prompt += "<p>You already have the tool granted by this feature from another source. Choose a different one.</p>";
			}

			let content = bc.choiceContent(choices, item.choose, prompt);
			
			let dlgOptions = {};
			if (choices.length > 10)
				dlgOptions.width = 600;

			let result = await doDialog({
				title: `Choose Tools`,
				content: content,
				buttons: {
					next: {
						label: "Next",
						icon: '<i class="fas fa-angles-right"></i>',
						callback: async (html) => {
							let chosenItems = bc.getChoices(html, choices);
							for (let it of chosenItems) {
								actor.update({[`system.tools.${it.key}.value`]: 1});
								addedTools.push(it.key);
							}
							return true;
						}
					},
					cancel: {
						label: "Cancel",
						callback: (html) => { return false; }
					}
				},
				default: "next",
				close: () => { return false; },
				render: (html) => { bc.handleChoiceRender(bc, html); }
			}, "", dlgOptions);
			if (!result)
				throw 'cancel';
		}

		async function addTools(list) {
			if (!list)
				return;
			let addedTools = [];
			for (const item of list) {
				if (item.name) {
					await actor.update({[`system.tools.${item.name}.value`]: 1});
					addedTools.push(item.name);
				} else if (item.choose) {
					await chooseTools(item, addedTools);
				}
			}
			await actor.updateEmbeddedDocuments("Item",
				[{ "_id": srcItem._id, "flags.build-character.tools": addedTools }]
			);
		}
		
		async function appendChoice(srcItem, choice) {
			let newName;
			if (srcItem.name.indexOf(":") < 0)
				newName = srcItem.name + ': ' + choice;
			else
				newName = srcItem.name + ', ' + choice;
			await actor.updateEmbeddedDocuments("Item", [{ "_id": srcItem._id, "name": newName }]);
		}
		
		async function increaseAbility(ability, increase, setsave, increasedAbilities) {
			let curValue = actor.system.abilities[ability].value;
			if (setsave) {
				let save = actor.system.abilities[ability].proficient;
				await actor.update({[`data.abilities.${ability}.proficient`]: 1});
				increasedAbilities.push({
					ability: ability,
					increase: increase,
					setsave: save
				});
			} else
				increasedAbilities.push({ability: ability, increase: increase});
			await actor.update({[`system.abilities.${ability}.value`]: curValue + increase});
		}

		async function abilityIncrease(itemName, inc) {
			let ability;
			let increase = inc.increase ?? 1;
			let increasedAbilities = [];

			if (inc.ability) {
				let abilityName = bc.abilityName(inc.ability);
				let curValue = actor.system.abilities[inc.ability].value;
				if (curValue + inc.increase >= inc.limit) {
					await Dialog.prompt({
					  title: "Ability Limit Reached",
					  content: `<p>You cannot make this selection.</p></p>${abilityName} is already ${inc.limit} or higher.</p>`,
					  label: "OK",
					  callback: (html) => { ; }
					});
					
					throw 'cancel';
				}
				await increaseAbility(inc.ability, inc.increase, false, increasedAbilities);
			} else if (inc.choose) {
				let choices = [];
				let limit = inc.limit ?? 20;
				
				function pushChoice(limit, c, choices) {
					let name = bc.abilityName(c);
					if (!name)
						return;
					if (actor.system.abilities[c].value + increase <= limit)
						choices.push({name: name, key: c});
				}

				if (inc.choices) {
					for (let c of inc.choices)
						pushChoice(limit, c, choices)
				} else {
					for (let c in CONFIG.DND5E.abilities)
						pushChoice(limit, c, choices)
				}

				if (choices.length == 0) {
					await Dialog.prompt({
					  title: "No Qualifying Abilities",
					  content: `<p>No abilities qualify for an increase from ${itemName}.</p>
						<p>The limit is ${limit} and it would be exceeded by adding ${increase}.</p>`,
					  label: "OK",
					  callback: (html) => { ; }
					});
					throw 'cancel';
				}

				let choose = inc.choose ?? 1;
				prompt = `${itemName}: Choose ${choose} ability(ies) to increase by ${increase}.`;
				let content = bc.choiceContent(choices, choose, prompt);
				
				let result = await doDialog({
					title: `Choose Ability to Increase`,
					content: content,
					buttons: {
						next: {
							label: "Next",
							icon: '<i class="fas fa-angles-right"></i>',
							callback: async (html) => {
								let chosenItems = bc.getChoices(html, choices);
								let names = [];
								for (let it of chosenItems) {
									names.push(it.name);
									await increaseAbility(it.key, increase, inc.setsave, increasedAbilities);
								}
								if (inc.updatename && names.length > 0)
									await appendChoice(srcItem, names.join(', '));
								return true;
							}
						},
						cancel: {
							label: "Cancel",
							callback: (html) => { return false; }
						}
					},
					default: "next",
					close: () => { return false; },
					render: (html) => { bc.handleChoiceRender(bc, html); }
				});
				if (!result)
					throw 'cancel';
			}
			// Add selections to item to source item so they can be undone.
			actor.updateEmbeddedDocuments("Item",
				[{ "_id": srcItem._id, "flags.build-character.abilityinc": increasedAbilities }]
			);
		}
		
		async function selectExpertise(name, expertise) {
			let choices = [];
			let updateName = false;

			for (let s of Object.keys(CONFIG.DND5E.skills)) {
				if (actor.system.skills[s].proficient == 1)
					choices.push({name: CONFIG.DND5E.skills[s].label, key: s});
			}

			if (choices.length == 0) {
				await Dialog.prompt({
				  title: "No Qualifying Skills",
				  content: `<p>No skills qualify for expertise granted by ${name}.</p>
					<p>You must be proficient in a skill to gain expertise.</p>`,
				  label: "OK",
				  callback: (html) => { ; }
				});
				throw 'cancel';
			}

			let choose = expertise.choose ?? 1;
			prompt = `${name}: Choose ${choose} skill(s) to gain expertise in.`;
			let content = bc.choiceContent(choices, choose, prompt);
			
			let chosenSkills = [];
			
			let result = await doDialog({
				title: `Choose Skills to Gain Expertise`,
				content: content,
				buttons: {
					next: {
						label: "Next",
						icon: '<i class="fas fa-angles-right"></i>',
						callback: async (html) => {
							let chosenItems = bc.getChoices(html, choices);
							for (let it of chosenItems) {
								chosenSkills.push({skill: it.key, value: actor.system.skills[it.key].value});
								await actor.update({[`data.skills.${it.key}.value`]: 2});
							}
							if (expertise.length > 0 && expertise[0].updatename && chosenItems.length > 0) {
								let names = [];
								for (let obj of chosenItems)
									names.push(obj.name);
								await appendChoice(srcItem, "Expertise: " + names.join(', '));
							}
							return true;
						}
					},
					cancel: {
						label: "Cancel",
						callback: (html) => { return false; }
					}
				},
				default: "next",
				close: () => { return false; },
				render: (html) => { bc.handleChoiceRender(bc, html); }
			});
			if (!result)
				throw 'cancel';
			// Add selections to item to source item so they can be undone.
			actor.updateEmbeddedDocuments("Item",
				[{ "_id": srcItem._id, "flags.build-character.expertise": chosenSkills }]
			);
		}

		async function chooseSkills(item, actor, f, skills) {
			// Get the granted skills.
			let updateName = false;
			let grantedSkills = [];
			let choices = [];
			for (let s of Object.keys(CONFIG.DND5E.skills)) {
				let proficient = actor.system.skills[s].proficient;
				if (proficient)
					grantedSkills.push(s);
			}

			for (const skill of skills) {
				if (skill.name != undefined) {
					// Add this skill to the list granted, but if it's already
					// granted by some other feature, allow the user to pick a
					// replacement for it.

					if (grantedSkills.find(s => s == skill.name)) {
						const skname = bc.skillName(skill.name);
						choices.push({choose: 1, reason: `${f.obj.name}: another feature already granted the skill ${skname}. Pick another skill in its place.`});
					} else
						grantedSkills.push(skill.name);
				}
				if (skill.choose != undefined) {
					// User gets to choose some skills.
					choices.push({choose: skill.choose, options: skill.options,
						reason: `Choose skill(s) for ${f.name}`});
				}
				if (skill.updatename)
					updateName = true;
			}
			
			if (choices.length > 0) {
				for (const choice of choices) {
					let selected = await pickSkills(choice, grantedSkills);
					if (!selected || selected.length == 0)
						return false;
					for (let i = 0; i < selected.length; i++)
						grantedSkills.push(selected[i]);
				}
			}
			
			let added = [];

			for (const skill of grantedSkills) {
				if (!actor.system.skills[skill].value) {
					added.push(skill);
					await actor.update({[`data.skills.${skill}.value`]: 1});
				}
			}
			
			if (added.length > 0) {
				if (updateName && added.length > 0) {
					let names = [];
					for (let skill of added)
						names.push(bc.skillName(skill));
					await appendChoice(srcItem, names.join(', '));
				}
				
				await actor.updateEmbeddedDocuments("Item",
					[{ "_id": item._id, "flags.build-character.skills": added }]
				);
			}
			
			return true;
		}

		async function pickSkills(choice, grantedSkills) {
			let allSkills = ["acr", "ani", "arc", "ath", "dec", "his", "ins", "itm", "inv", "med", "nat", "prc", "prf", "per", "rel", "slt", "ste", "sur"];	
			let list = choice.options != undefined ? choice.options : allSkills;
			let skills = [];
			for (let skill of list) {
				if (grantedSkills.find(s => s == skill))
					continue;
				skills.push(
					{name: bc.skillName(skill), code: skill}
				);
			}
			let alreadySelected = [];
			for (let s of grantedSkills) {
				alreadySelected.push(bc.skillName(s));
			}
			let prompt = `<p>${choice.reason}</p>`;
			if (alreadySelected.length > 0) {
				let str = alreadySelected.join(', ');
				prompt += `<p style="left-margin: .2in">Already selected: ${str}</p>\n`;
			}

			let dlgOptions = {};
			if (skills.length > 10)
				dlgOptions.width = 600;

			let content = bc.choiceContent(skills, choice.choose, prompt);
			let pickedSkills = [];
			let result = await doDialog({
			  title: "Choose Skills",
			  content: content,
			  buttons: {
				ok: {
				  label: "Next",
				  icon: '<i class="fas fa-angles-right"></i>',
				  callback: async (html) => {
					  let chosenSkills = bc.getChoices(html, skills);
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
			  close: () => { return false; },
			  render: (html) => { bc.handleChoiceRender(this, html); }
			}, "", dlgOptions);
			return pickedSkills;
		}
		
		function setSpellData(itemData, s) {
			if (s.ability)
				itemData.system.ability = s.ability;
			if (s.preparation)
				itemData.system.preparation.mode = s.preparation;
			if (s.uses) {
				for (let fld in s.uses)
					itemData.system.uses[fld] = s.uses[fld];
			}
		}

		async function chooseSpells(srcItem, actor, f) {
			let addedSpells = [];

			for (let s of f.obj.spells) {
				if (s.advancement) {
					// Ignore advancements, should be added to
					// the feature so it will be handled by the
					// advancement feature when the user levels up.
					;
				} else if (s.choose) {
					let added = await pickSpells(actor, f, s);
					if (!added)
						return false;
					addedSpells = addedSpells.concat(added);
				} else if (s.name) {
					// Add the named spell by its uuid.
					if (s.uuid) {
						const item = await fromUuid(s.uuid);
						if (item) {
							let itemData = item.toObject();
							setSpellData(itemData, s);
							let added = await actor.createEmbeddedDocuments("Item", [itemData]);
							addedSpells = addedSpells.concat(added);
						} else {
							ui.notifications.warn(`Unable to read spell ${s.name} (${s.uuid})`);
						}
					} else
						ui.notifications.warn(`No uuid provided for spell "${s.name}" in item data.`);
				}
			}

			if (addedSpells.length > 0) {
				let ids = [];
				for (let spell of addedSpells)
					ids.push(spell._id);
				await actor.updateEmbeddedDocuments("Item",
					[{ "_id": srcItem._id, "flags.build-character.spells": ids }]
				);
			}	
		}
		
		async function selectAmmoWeapon(name, ammo) {
			// Find a weapon in the inventory that takes ammo.
			let weapons = [];
			let weapon = null;
			for (let it of actor.items) {
				if (it.type == ammo.for && it.system?.properties.amm)
					weapons.push({"name": it.name, "id": it._id});
			}
			if (weapons.length == 0)
				return;
			if (weapons.length == 1) {
				weapon = weapons[0];
			} else {
				prompt = `Choose the ${ammo.for} that uses ${name}.`;
				let content = bc.choiceContent(weapons, 1, prompt);

				let result = await doDialog({
					title: `Choose Weapon for Ammunition`,
					content: content,
					buttons: {
						next: {
							label: "Next",
							icon: '<i class="fas fa-angles-right"></i>',
							callback: async (html) => {
								let chosenItems = bc.getChoices(html, weapons);
								if (chosenItems.length > 0)
									weapon = chosenItems[0];
								return true;
							}
						},
						cancel: {
							label: "Cancel",
							callback: (html) => { return false; }
						}
					},
					default: "next",
					close: () => { return false; },
					render: (html) => { bc.handleChoiceRender(bc, html); }
				});
				if (!result)
					throw 'cancel';
			}

			if (weapon) {
				await actor.updateEmbeddedDocuments("Item",
					[ { "_id": weapon.id, "system.consume": {target: srcItem._id, type: 'ammo', amount: 1 }} ]
				);
				
			}
		}
		
		async function pickSpells(actor, feature, s) {
			let spells = [];

			let list = [];

			let levelList = bc.itemData.spells.find((lev) => lev.level == s.level);
			if (!levelList) {
				ui.notifications.warn(`pickSpells: No level ${s.level} spells found`);
				return false;
			}
			let classList = null;
			if (s.class) {
				classList = bc.itemData.spells.find((c) => c.class == s.class);
				if (!classList)
					throw new Error(`No definitions found for ${s.class} for choosing spells.`);
			}
			
			let alreadySelected = [];

			for (let name of levelList.spells) {
				if (classList)
					if (!classList.spells.includes(name))
						continue;
				if (s.schools) {
					let found = false;
					for (const school of s.schools) {
						const schoolList = bc.itemData.spells.find(sch => sch.school == school);
						if (schoolList) {
							if (schoolList.spells.includes(name)) {
								found = true;
								break;
							}
						}
					}
					if (!found)
						continue;
				}
				if (actor.items.find(i => i.type == 'spell' && i.name == name))
					alreadySelected.push(name);
				else
					list.push(name);
			}
			
			// Fetch uuid from compendium index.

			for (const pack of game.packs) {
				if (pack.metadata.type === 'Item') {
					for (let spell of list) {
						let sp = pack.index.find((obj) => obj.type == 'spell' && spell == obj.name);
						if (sp) {
							spells.push(
								{
									name: spell,
									ability: s.ability,
									preparation: s.preparation,
									uses: s.uses,
									pack: pack.metadata.id,
									obj: spell,
									uuid: sp.uuid
								}
							);
						}
					}
				}
			}
			
			// Report any items that weren't found in a pack to check for typoes.

			for (let name of list) {
				if (!spells.find((s) => name == s.name))
					ui.notifications.warn(`Did not find ${name} in any compendium.`);
			}
			
			let title = "Select Spells";
			
			let type = s.level == 'cantrip' ? 'cantrip(s)' : `level ${s.level} spell(s)`;
			let description;
			if (s.prompt)
				description = s.prompt;
			else
				description = `Select ${s.choose} ${type} for ${feature.name}.`;
			if (alreadySelected.length > 0)
				description += "<br><br>Already selected: " + alreadySelected.join(', ');

			let dlgOptions = {};
			if (spells.length > 10)
				dlgOptions.width = 600;

			let content = bc.choiceContent(spells, s.choose, description, []);
			let chosenSpells = undefined;

			let next = await Dialog.wait({
			  title: title,
			  content: content,
			  buttons: {
				next: {
				  label: "Next",
				  icon: '<i class="fas fa-angles-right"></i>',
				  callback: async (html) => {
					  chosenSpells = bc.getChoices(html, spells);
					  return +1;
				  },
				},
				cancel: {
					label: "Cancel",
					callback: (html) => { return 0; }
				},
			  },
			  default: "next",
			  close: () => { return false; },
			  render: (html) => { bc.handleChoiceRender(bc, html); }
			}, dlgOptions);

			let addedSpells = [];

			if (next > 0) {
				for (let s of chosenSpells) {
					const item = await fromUuid(s.uuid);
					if (item) {
						let itemData = item.toObject();
						setSpellData(itemData, s);
						addedSpells = addedSpells.concat(await actor.createEmbeddedDocuments("Item", [itemData]));
					} else {
						ui.notifications.warn(`Unable to read spell ${s.name} (${s.uuid})`);
					}
				}
			}
			
			return addedSpells;
		}
		
		async function addPassive(passive) {
			for (let entry of passive) {
				let curValue = actor.system.skills[entry.skill].passive;
				await actor.update({[`system.skills.${entry.skill}.passive`]: entry.value + curValue});
			}
			await actor.updateEmbeddedDocuments("Item",
				[{ "_id": srcItem._id, "flags.build-character.passive": passive }]
			);
		}
		
		async function setFlag(flagData) {
			let members = flagData.flag.split(/ *\. */);
			if (members.length < 2)
				throw new Error(`setflag: improperly formed flag: ${flagData.flag}. Must have at least 2 levels.`);
			let curValue = "";
			let obj = actor.flags;
			for (let i = 0; i < members.length - 1; i++) {
				if (!obj[members[i]]) {
					obj = null;
					break;
				}
				obj = obj[members[i]];
			}
			if (obj)
				curValue = obj[members.length - 1];

			if (curValue != flagData.value) {
				await actor.updateEmbeddedDocuments("Item",
					[{ "_id": srcItem._id, "flags.build-character.setflag": 
						{flag: flagData.flag, value: curValue}
					}]
				);
				await actor.update({[`flags.${flagData.flag}`]: flagData.value});
			}
			
		}
		
		for (const f of features) {
			if (!f)
				continue;

			try {
				for (let task in f.obj) switch (task) {
				case 'skills':
					if (!f.obj.multiclass || actor.system.details.level <= 1)
						await chooseSkills(srcItem, actor, f, f.obj.skills);
					break;
				case 'multiclass':
					for (let prof in f.obj.multiclass) {
						switch (prof) {
						case 'armor':
							await addProfs(f.obj.name, f.obj.multiclass.armor, "armorProf");
							break;
						case 'skills':
							await chooseSkills(srcItem, actor, f, f.obj.multiclass.skills);
							break;
						case 'weapons':
							await addProfs(f.obj.name, f.obj.multiclass.weapons, "weaponProf");
							break;
						case 'tools':
							await addTools(f.obj.multiclass.tools);
							break;
						case 'languages':
							await addProfs(f.obj.name, f.obj.multiclass.languages, "languages");
							break
						}
					}
					break;
				case 'spells':
					await chooseSpells(srcItem, actor, f);
					break;
				case 'features':
					await this.addFeatures(srcItem, actor, f);				
					break;
				case 'saves':
					if (actor.system.details.level <= 1) {
						// Only the first class gets saving throw proficiencies.
						let saves = [];
						for (const save of f.obj.saves) {
							saves.push(this.abilityNames[save]);
							actor.update({[`data.abilities.${this.abilityNames[save]}.proficient`]: 1});
						}
						actor.updateEmbeddedDocuments("Item",
							[{ "_id": srcItem._id, "flags.build-character.saves": saves }]
						);
					}
					break;
				case 'darkvision':
					if (actor.system.attributes.senses.darkvision < f.obj.darkvision) {
						await actor.updateEmbeddedDocuments("Item",
							[{ "_id": srcItem._id, "flags.build-character.darkvision": actor.system.attributes.senses.darkvision }]
						);
						actor.update({"data.attributes.senses.darkvision": f.obj.darkvision});
						actor.update({"prototypeToken.sight.range": f.obj.darkvision});
					}
					break;
				case 'hplevel':
					let hpbonus = Number(actor.system.attributes.hp.bonuses.level) + f.obj.hplevel;
					await actor.update({"system.attributes.hp.bonuses.level": hpbonus});
					await actor.updateEmbeddedDocuments("Item",
						[{ "_id": srcItem._id, "flags.build-character.hplevel": f.obj.hplevel }]
					);
					break;
				case 'size':
					if (actor.system.traits.size != f.obj.size) {
						await actor.updateEmbeddedDocuments("Item",
							[{ "_id": srcItem._id, "flags.build-character.size": actor.system.traits.size }]
						);
						actor.update({"data.traits.size": f.obj.size});
					}
					break;
				case 'speed':
					if (actor.system.attributes.movement.walk != f.obj.speed) {
						await actor.updateEmbeddedDocuments("Item",
							[{ "_id": srcItem._id, "flags.build-character.speed": actor.system.attributes.movement.walk }]
						);
						actor.update({"data.attributes.movement.walk": f.obj.speed});
					}
					break;

				case 'spellcasting':
					// Only set the spellcasting ability for the first class.
					if (actor.items.filter(it => it.type == 'class' && it.system?.spellcasting?.ability).length <= 1)
						actor.update({"system.attributes.spellcasting": f.obj.spellcasting});
					break;
				case 'armor':
					if (!f.obj.multiclass || actor.system.details.level <= 1)
						await addProfs(f.obj.name, f.obj.armor, "armorProf");
					break;
				case 'weapons':
					if (!f.obj.multiclass || actor.system.details.level <= 1)
						await addProfs(f.obj.name, f.obj.weapons, "weaponProf");
					break;
				case 'languages':
					if (!f.obj.multiclass || actor.system.details.level <= 1)
						await addProfs(f.obj.name, f.obj.languages, "languages");
					break;
				case 'tools':
					if (!f.obj.multiclass || actor.system.details.level <= 1)
						await addTools(f.obj.tools);
					break;
				case 'abilityinc':
					await abilityIncrease(f.obj.name, f.obj.abilityinc);
					break;
				case 'expertise':
					await selectExpertise(f.obj.name, f.obj.expertise);
					break;
				case 'passive':
					await addPassive(f.obj.passive);
					break;
				case 'ammo':
					if (f.obj.ammo)
						selectAmmoWeapon(f.obj.name, f.obj.ammo);
					break;
				case 'setflag':
					await setFlag(f.obj.setflag);
					break;
				default:
					break;
				}
			} catch (msg) {
				if (msg !== 'cancel')
					throw msg;
			}
		}
	}


	choiceContent(choices, limit, description, prechecked) {

		choices.sort(function(a, b) {
			return a.name.localeCompare(b.name);
		});
		
		let choiceText = "";

		let colwidth = Math.trunc(100 / Math.min(3, 1+Math.trunc(choices.length/10)));

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
				flex-grow: 1;
				width: ${colwidth}%;
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
		
		content += `<div style="padding-bottom: 12px; display: flex; flex-flow: row wrap">`;
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
				if (e.target.type == 'checkbox') {
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
				}
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

	
	async selectAbilities(actor, race, subrace) {
		this.racialBonus.Strength = 0;
		this.racialBonus.Dexterity = 0;
		this.racialBonus.Constitution = 0;
		this.racialBonus.Intelligence = 0;
		this.racialBonus.Wisdom = 0;
		this.racialBonus.Charisma = 0;
		
		if (!race) {
			// No race passed in, check the character items for race and subrace.
			for (let item of actor.items) {
				if (item.type == 'feat') {
					let r = this.itemData.races.find(r => item.name == r.name);
					if (r)
						race = {name: item.name, obj: r};
					else {
						r = this.itemData.subraces.find(r => item.name == r.name);
						if (r)
							subrace = {name: item.name, obj: r};
					}
				}
			}
		}

		if (!race) {
			await Dialog.prompt({
			  title: "Select Abilities: No Race Found",
			  content: `There is no race in the Features tab of the character sheet.<br><br>
				Drag and drop a race and subrace onto the character sheet before selecting abilities.
				These are needed to determine the racial bonuses for the abilities.<br><br>`,
			  label: "OK",
			  callback: (html) => { ; }
			});
			return;
		}

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
		
		let content = `<form>`;
		if (this.abilityMethod == 'pointbuy')
			content += `<p>Each ability costs a number of points. You have a total of ${this.totalPoints} points to spend. Racial bonuses can reduce the cost of abilities.</p>
			  <p><strong>Ability Costs</strong> 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9</p>`;
		else
			content += `Enter the roll for each ability in <b>Die Roll</b>.`;

		if (choose)
			content += `<p>${choose}</p>`;
		let baseValueTitle;
		if (this.abilityMethod == 'pointbuy') {
			content += `<p>Remaining Points: <strong><span id="remainingPoints">${this.totalPoints}</span></strong> = ${this.totalPoints} - <span id="curTotal">0</span></p>`;
			baseValueTitle = 'Base Value';
		} else {
			baseValueTitle = 'Die Roll';
		}

		content +=
			  `<table>
				<tr>
					<th style="text-align: left">Ability</th>
					<th>${baseValueTitle}</th>
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
			if (pb.abilityMethod == 'enter') {
				recordAbilities(pb);
				return true;
			}

			let usedPoints = pb.calcCost(html);
			recordAbilities(pb);
			if (usedPoints != pb.totalPoints) {
				ui.notifications.warn(`The total spent must equal ${pb.totalPoints} points. You spent ${usedPoints}.`);
			}
			return true;
		}

		let reason = await Dialog.wait({
		  title: "Select Ability Scores",
		  content: content,
		  buttons: {
			next: {
				icon: '<i class="fas fa-check"></i>',
				label: "Next",
				callback: async (html) => {
					return setAbilities(this, html);
				},
			},
			cancel: {
				label: "Cancel",
				icon: '<i class="fas fa-x"></i>',
				callback: (html) => { return false; }
			},
		  },
		  default: "next",
		  close: () => { return false; },
		  render: (html) => { handleRender(this, html); }
		}, {rejectClose: false} );
	}


	async advancementComplete(am) {
		if (!am || !am.steps)
			return;

		if (am.steps.length <= 0)
			return;

		let step0 = am.steps[0];
		if (step0.type == 'reverse')
			return;
		
		let item = step0?.flow?.item;
		if (!item || item.type != 'class')
			return;

		await this.checkVersion(am.actor);

		if (item.type == 'class' || item.type == 'subclass') {
			// FIX: for now only handle level 1. In future, could handle adding
			// spells for drow at levels 3 and 5.

			if (step0.class.level > 1)
				return;
		}

		await this.readItemData();

		let obj = this.itemData.classes.find(r => item.name == r.name);
		if (!obj)
			return;

		let feature = {
			name: item.name,
			obj: obj,
			pack: null,
			uuid: null
		};
		this.setSpellPrepMode(am.actor);
		
		await this.setData(item, am.actor, [feature]);
	}
	
	async setSpellPrepMode(actor) {
		let spellclasses = actor.items.filter(it => it.type == 'class' || it.type == 'subclass');
		let modes = [];
		for (let c of spellclasses) {
			let obj = this.itemData.classes.find(r => r.name == c.name);
			if (!obj)
				obj = this.itemData.subclasses.find(r => r.name == c.name);
			if (obj?.spellprepmode)
				if (!modes.includes(obj.spellprepmode))
					modes.push(obj.spellprepmode);
		}
		if (modes.length == 0)
			return;

		if (modes.length != 1)
			modes = ['prepared'];
		if (actor.getFlag('build-character', 'spellprepmode') != modes[0])
			await actor.setFlag('build-character', 'spellprepmode', modes[0]);
	}

	async checkVersion(actor) {
		if (!actor)
			return;
		let curVersion = actor.getFlag('build-character', 'version');
		if (curVersion == undefined || curVersion < this.bcVersion) {
			// Fix anything that needs fixing to make the character
			// compatible with this version of the module.
			await this.readItemData();
			await this.setSpellPrepMode(actor);
			await actor.setFlag('build-character', 'version', this.bcVersion);
		}
	}

	async itemAdded(item) {
		await this.checkVersion(item.parent);

		await this.readItemData();

		let obj = null;

		switch (item.type) {
		case 'background':
			obj = this.itemData.backgrounds.find(r => item.name == r.name);
			break;
		case 'feat':
			switch (item.system.type.value) {
			case 'feat':
				if (this.itemData.feats)
					obj = this.itemData.feats.find(r => item.name == r.name);
				break;
			case '':
				// Race or subrace. Also set value on character sheet.
				// Blank system.type may be a race or subrace.
				obj = this.itemData.races.find(r => item.name == r.name);
				if (!obj) {
					obj = this.itemData.subraces.find(r => item.name == r.name);
					if (obj && obj.race) {
						if (!item.parent.items.find(r => r.name == obj.race))
							Dialog.prompt({title: "Race Missing",
								content: `<p>The ${obj.name} subrace requires the ${obj.race} race.<p>`
							});
					}
				}
				if (obj) {
					await item.parent.updateEmbeddedDocuments("Item",
						[{ "_id": item._id, "flags.build-character.race": item.parent.system.details.race }]
					);
					item.parent.update({"data.details.race": item.name});
				} else {
					obj = this.itemData.features.find(r => item.name == r.name);
				}
				break;
			default:
				if (item.system?.type?.value) {
					let listName = 'feat-' + item.system.type.value;
					if (this.itemData[listName])
						obj = this.itemData[listName].find(r => item.name == r.name);
				}
				break;
			}
			break;
		case 'subclass':
			obj = this.itemData.subclasses.find(r => item.name == r.name);
			break;
		case 'class':
			// Classes are handled by the advancement complete hook.
			return;
		case 'spell':
			// Set spell preparation mode for level 1+ spells to mode indicated
			// on character if they come in marked as unprepared (spells added for a class will
			// have the preparation mode marked, but spells added directly by user
			// will always be prepared, the default value).
			if (item.system.level <= 0 || item.system.preparation.mode != 'prepared')
				return;
			const spellprepmode = item.parent.getFlag('build-character', 'spellprepmode');
			if (item.parent.getFlag('build-character', 'spellprepmode') == undefined)
				this.setSpellPrepMode(item.parent);
			if (spellprepmode && item.system.preparation.mode != spellprepmode) {
                item.parent.updateEmbeddedDocuments("Item", [{ "_id": item._id, "system.preparation.mode": spellprepmode }]);
			}
			return;
		default:
			if (this.itemData[item.type]) {
				obj = this.itemData[item.type].find(r => item.name == r.name);
			}
			break;
		}

		if (!obj)
			return;

		let feature = {
			name: item.name,
			obj: obj,
			pack: null,
			uuid: null
		};

		await this.setData(item, item.parent, [feature]);
	}
	
	async selectImage(actor) {
		let portraitFolder = game.settings.get('build-character', 'portraits');

		async function setPortrait(actor, file) {
			actor.update({"img": file});

			const content = `<p>Use the Image Browser in the next dialog to select the image used for the character token.</p>
					<p>In the Image Browser click the image for the token, then click Select File at the bottom of the image browser.</p>`;
			let result = await Dialog.wait({
			  title: "Select Token Image",
			  content: content,
			  buttons: {
				next: {
					icon: '<i class="fas fa-check"></i>',
					label: "Next",
					callback: async (html) => { return true; }
				}
			  },
			  default: "next",
			  close: () => { return false; }
			}, {rejectClose: false} );
			if (!result)
				return;

			let tokenPicker = new FilePicker({
				type: "image",
				displayMode: "tiles",
				current: portraitFolder,
				callback: (file) => {
					actor.update({
						"prototypeToken.name": actor.name,
						"prototypeToken.texture.src": file,
						"prototypeToken.texture.scaleX": 0.8,
						"prototypeToken.texture.scaleY": 0.8
					});
				}
			});
			tokenPicker.render();
		}

		let picker = new FilePicker({
			type: "image",
			displayMode: "tiles", 
			current: portraitFolder,
			callback: (file) => { setPortrait(actor, file); }
		});
		
		const content = `<p>Use the Image Browser in the next dialog to select the portrait on the character sheet.</p>
			<p>In the Image Browser click the image for the portrait, then click Select File at the bottom of the image browser.</p>`;
	
		let result = await Dialog.wait({
		  title: "Select Character Portrait",
		  content: content,
		  buttons: {
			next: {
				icon: '<i class="fas fa-check"></i>',
				label: "Next",
				callback: async (html) => { return true; }
			}
		  },
		  default: "next",
		  close: () => { return false; }
		}, {rejectClose: false} );
		if (!result)
			return;

		picker.render();
	}

	/**	Undo the changes made by this item. If two items give the same thing,
	 *	for example, a class gives armor proficiency and a race does too,
	 *	don't remove the proficiency until there's no other contributor of the
	 *	proficiency.
	 */

	deleteItem(item) {
		function deleteItemList(list) {
			// Don't try to delete items that have already been deleted.
			let deleteThese = [];
			for (let id of list) {
				let obj = item.parent.items.has(id);
				if (obj)
					deleteThese.push(id);
			}
			if (deleteThese.length > 0)
				item.parent.deleteEmbeddedDocuments("Item", deleteThese);
		}
		
		function otherContributor(trait, prof) {
			let count = 0;
			for (let it of item.parent.items) {
				let flags = it.flags['build-character'];
				if (flags && flags.traits) {
					if (flags.traits[trait]?.includes(prof))
						return true;
				}
			}
			return false;
		}

		let flags = item?.flags['build-character'];
		if (!flags)
			return;

		for (let type in flags) switch (type) {
		case 'skills':
			// Unset selected skills.
			for (let skill of item.flags['build-character'].skills)
				item.parent.update({[`data.skills.${skill}.value`]: 0});
			break;
		case 'traits':
			for (let trait of Object.keys(flags.traits)) {
				let remaining = [];
				for (let prof of item.parent.system.traits[trait].value)
					if (!flags.traits[trait].includes(prof) || otherContributor(trait, prof))
						remaining.push(prof);
				item.parent.update({[`system.traits.${trait}.value`]: remaining});
			}
			break;
		case 'custom':
			for (let trait of Object.keys(flags.custom)) {
				if (!item.parent.system?.traits[trait]?.custom)
					break;
				let remaining = [];
				let items = item.parent.system.traits[trait].custom.split(/ *; */);
				for (let it of items)
					if (!flags.custom[trait].includes(it))
						remaining.push(it);
				item.parent.update({[`system.traits.${trait}.custom`]: remaining.join(';')});
			}
			break;
		case 'tools':
			for (let tool of flags.tools) {
				// Remove this tool if no other item added it.
				let count = 0;
				for (let it of item.parent.items) {
					let flags = it.flags['build-character'];
					if (flags && flags.tools) {
						if (flags?.tools.includes(tool)) {
							count++;
							break;
						}
					}
				}
				if (count <= 0)
					item.parent.update({[`system.tools.-=${tool}`]: null});
			}
			break;
		case 'features':
			deleteItemList(flags.features);
			break;
		case 'spells':
			deleteItemList(flags.spells);
			break;
		case 'saves':
			for (let save of flags.saves)
				item.parent.update({[`data.abilities.${save}.proficient`]: 0});
			break;
		case 'darkvision':
			item.parent.update({"data.attributes.senses.darkvision": flags.darkvision});
			break;
		case 'speed':
			item.parent.update({"data.attributes.movement.walk": flags.speed});
			break;
		case 'size':
			item.parent.update({"data.traits.size": flags.size});
			break;
		case 'race':
			item.parent.update({"system.details.race": flags.race});
			break;
		case 'abilityinc':
			for (let inc of flags.abilityinc) {
				let newValue = item.parent.system.abilities[inc.ability].value - inc.increase;
				item.parent.update({[`system.abilities.${inc.ability}.value`]: newValue});
				if (inc.setsave !== undefined)
					item.parent.update({[`system.abilities.${inc.ability}.proficient`]: inc.setsave});
			}
			break;
		case 'expertise':
			for (let e of flags.expertise)
				item.parent.update({[`system.skills.${e.skill}.value`]: e.value});
			break;
		case 'hplevel':
			let hplevelbonus = item.parent.system.attributes.hp.bonuses.level;
			item.parent.update({"system.attributes.hp.bonuses.level": hplevelbonus-flags.hplevel});
			break;
		case 'passive':
			for (let passive of flags.passive) {
				let curValue = item.parent.system.skills[passive.skill].passive;
				item.parent.update({[`system.skills.${passive.skill}.passive`]: curValue - passive.value});
			}
			break;
		case 'setflag':
			item.parent.update({[`flags.${flags.setflag.flag}`]: flags.setflag.value});
			break;
		}
	}
	
	finish() {
		// console.log(`build-character | Finished setting abilities for ${this.actor.name}`);
	}

	static {
		let itemData = undefined;
		let fileDates = [];

		Hooks.on("dnd5e.advancementManagerComplete", async function(am) {
		  let bc = new BuildCharacter();
		  if (bc)
			  bc.advancementComplete(am);
		});

		Hooks.on("createItem", async function(item, sheet, data) {
			// Exit immediately if item was created by another user.
			if (data != game.user.id || !item.parent)
				return;
			let bc = new BuildCharacter();
			if (bc)
				bc.itemAdded(item);
		});

		Hooks.on("deleteItem", async function(item, sheet, data) {
			// Exit immediately if item was created by another user.
			if (data != game.user.id || !item.parent)
				return;
			if (item.flags['build-character']) {
				let bc = new BuildCharacter();
				if (bc)
					bc.deleteItem(item);
			}
		});

	}
}

async function doDialog(dlg, msg, options) {
	let result;
	try {
		result = await Dialog.wait(dlg, {}, options);
	} catch (m) {
		ui.notifications.warn(m);
		return false;
	}
	return result;
}


/*
 * Create the configuration settings.
 */
Hooks.once('init', async function () {

	game.settings.register('build-character', 'abilityMethod', {
	  name: 'Ability selection method',
	  config: true,
	  type: String,
	  default: 'enter',
	  choices: {
		"pointbuy": "Point Buy",
		"enter": "Enter Die Rolls"
	  },
	});

	game.settings.register('build-character', 'budget', {
	  name: 'Points available for abilities',
	  hint: 'This is the number of points available for buying abilities with point buy.',
	  scope: 'client',     // "world" = sync to db, "client" = local storage
	  config: true,       // false if you dont want it to show in module config
	  type: Number,       // Number, Boolean, String, Object
	  default: 27
	});

	game.settings.register('build-character', 'maindata', {
	  name: 'Main Data File',
	  hint: 'Contains base definitions for items from the SRD.',
	  config: true,
	  type: String,
	  onChange: value => { BuildCharacter.itemData = null; },
	  filePicker: true,
	  default: "modules/build-character/srdBuildData.json",
	});

	game.settings.register('build-character', 'customdata', {
	  name: 'Custom Data File',
	  hint: 'Definitions for any custom data, such as PHB or homebrew items.',
	  config: true,
	  type: String,
	  onChange: value => {
		  BuildCharacter.itemData = null;
	  },
	  filePicker: true,
	  default: "modules/build-character/phbBuildData.json"
	});

	game.settings.register('build-character', 'worlddata', {
	  name: 'World Data File',
	  hint: 'Definitions for world data.',
	  config: true,
	  type: String,
	  onChange: value => { BuildCharacter.itemData = null; },
	  filePicker: true,
	  default: ""
	});

	game.settings.register('build-character', 'auxdata', {
	  name: 'Auxiliary Data File',
	  hint: 'Definitions for any other auxiliary items.',
	  config: true,
	  type: String,
	  onChange: value => { BuildCharacter.itemData = null; },
	  filePicker: true,
	  default: ""
	});

	game.settings.register('build-character', 'portraits', {
	  name: 'Portrait Folder',
	  hint: 'Path to folder where portraits and tokens for player characters are stored.',
	  scope: 'client',     // "world" = sync to db, "client" = local storage
	  config: true,       // false if you dont want it to show in module config
	  type: String,       // Number, Boolean, String, Object
	  default: "",
	  filePicker: "folder"
	});

	game.settings.register('build-character', 'defaultportrait', {
	  name: 'Default Portrait',
	  hint: 'Path to the default portrait.',
	  scope: 'client',     // "world" = sync to db, "client" = local storage
	  config: true,       // false if you dont want it to show in module config
	  type: String,       // Number, Boolean, String, Object
	  default: "",
	  filePicker: "image"
	});
	
	game.settings.register('build-character', 'defaulttoken', {
	  name: 'Default Portrait',
	  hint: 'Path to the default token.',
	  scope: 'client',     // "world" = sync to db, "client" = local storage
	  config: true,       // false if you dont want it to show in module config
	  type: String,       // Number, Boolean, String, Object
	  default: "",
	  filePicker: "image"
	});
	
});

function insertActorHeaderButtons(actorSheet, buttons) {
	let actor = actorSheet.object;

	buttons.unshift({
		label: "Set Abilities",
		icon: "fas fa-calculator",
		class: "set-ability-button",
		onclick: async () => {
			let bc = null;
			try {
				bc = new BuildCharacter();
				await bc.readItemData();
				if (!await bc.selectAbilities(actor, null, null))
					return false;
			} catch (msg) {
				ui.notifications.warn(msg);
			} finally {
				if (bc)
					bc.finish();
			}
		}
	});
	buttons.unshift({
		label: "Select Image",
		icon: "fas fa-user-plus",
		class: "select-image-button",
		onclick: async () => {
			let bc = null;
			try {
				bc = new BuildCharacter();
				if (!await bc.selectImage(actor))
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

// Put button on actor tab to reload data.

Hooks.on("renderActorDirectory", (app, html, data) => {
	if (!game.user.isGM)
		return;

    const createButton = $("<button id='build-character-button'><i class='fas fa-user-plus'></i> Reload Build Data</button>");
    html.find(".directory-footer").append(createButton);

    createButton.click(async (ev) => {
		let bc;
		try {
			bc = new BuildCharacter();
			BuildCharacter.itemData = null;
			await bc.readItemData();
			ui.notifications.notify("Build Character data reloaded");
		} catch (msg) {
			ui.notifications.warn(msg);
		} finally {
			if (bc)
				bc.finish();
		}
    });
});


export class CreateCharacter extends Application {
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

	async create() {
		let name = "";
		let result;
		result = await Dialog.wait({
		  title: "Create Character",
		  content: this.flexCSS + `<div class="container">
				<label class="label" for="name">Name&nbsp;&nbsp;</label>
				<input class="input" type="text" id="name" name="name" autofocus>
			</div><br>`,
		  buttons: {
			create: {
			  label: "<b>Create Character</b>",
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

		await actor.update({
				"prototypeToken.texture.src": game.settings.get('build-character', 'defaulttoken'),
				"prototypeToken.name": actor.name,
				"prototypeToken.texture.scaleX": 0.8,
				"prototypeToken.texture.scaleY": 0.8
			});

		actor.sheet.render(true)
	}

}

Hooks.once('init', async function () {
	if (!game.BuildCharacter) {
		game.BuildCharacter = {};
		game.BuildCharacter.cc = new CreateCharacter();
	}
})
