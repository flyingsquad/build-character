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
	choose = "";

	isRace(name) {
		let info = '';
		let r = this.itemData.races.find( (r) => r.name == name);
		if (r === undefined) {
			r = this.itemData.subraces.find( (r) => r.name == name);
			if (r === undefined)
				return false;
		}
		
		for (const [key, value] of Object.entries(r.abilities)) {
			switch (key) {
			case 'description':
				info = value;
				break;
			default:
				this.racialBonus[key] += value;
				break;
			}
		}
		
		if (this.choose)
			this.choose += '<br>';
		this.choose += `<strong>${name}</strong> ${info}`;
		return true;
	}
	
	async readItemData() {
		this.itemData.races = [];
		this.itemData.subraces = [];
		this.itemData.subclasses = [];
		this.itemData.classes = [];
		this.itemData.backgrounds = [];
		this.itemData.customLanguages = [];
		
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
	
	async buildCharacter(actor) {
		await this.readItemData();
		let chosenRace = await this.getRace(actor);
		if (!chosenRace)
			return;
		
		let chosenBackground = await this.getBackground(actor);
		if (!chosenBackground)
			return;
		await this.pointBuy(actor);
	}
	
	async getRace(actor) {
		let count = 0;

		function handleRender(pb, html) {
			html.on('change', html, (e) => {
				// Allow just one checked item.
				let html = e.data;
				switch (e.target.nodeName) {
				case 'INPUT':
					if (e.target.checked)
						count++;
					else
						count--;
					if (count > 1) {
						e.target.checked = false;
						count--;
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
		
		let content = `<div>`;

		// List all the races found in the data files.
		// Races have no identifying tags in the compendiums,
		// so the only way to know a feature is a race is
		// to check that it's in our list of races from our
		// race .json file(s).

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
								race: race,
								uuid: r.uuid
							}
						);
					}
				}
			}
		}
		
		races.sort(function(a, b) {
			return a.name.localeCompare(b.name);
		});
		let i = 0;
		for (const r of races) {
			content += `<input type="checkbox" id="${i}" name="race" value="${r.uuid}"></input><label for="race"><a class="control showuuid" uuid="${r.uuid}">${r.name}</a></label><br>\n`;
			i++;
		}

		content += `</div>`;

		let chosenRace = undefined;
		let result = await Dialog.wait({
		  title: "Select Race",
		  content: content,
		  buttons: {
			ok: {
			  label: "OK",
			  icon: '<i class="fas fa-angles-right"></i>',
			  callback: async (html) => {
				for (i = 0; i < races.length; i++) {
					let cb = html.find(`#${i}`);
					if (cb[0].checked) {
						chosenRace = races[i].race;
						const item = await fromUuid(races[i].uuid);
						if (item) {
							// FIX: should use call that executes advancement steps.
							actor.createEmbeddedDocuments("Item", [item]);
						} else {
							throw new Error(`Could not get item ${$races[i].uuid}`);
						}
						break;
					}
				}
				return count > 0;
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
		return chosenRace;
	}
	
	async getBackground(actor) {
		let count = 0;

		function handleRender(pb, html) {
			html.on('change', html, (e) => {
				let html = e.data;
				switch (e.target.nodeName) {
				case 'INPUT':
					if (e.target.checked)
						count++;
					else
						count--;
					if (count > 1) {
						e.target.checked = false;
						count--;
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

		
		let content = `<div>`;

		// List all the backgrounds found.

		let bgs = [];

		for (const pack of game.packs) {
			if (pack.metadata.type === 'Item') {
				for (const bg of pack.index) {
					if (bg.type === 'background') {
						let obj = {
							name: bg.name,
							pack: pack.metadata.id,
							uuid: bg.uuid,
							background: bg
						}
						bgs.push(obj);
					}
				}
			}
		}
		
		bgs.sort(function(a, b) {
			return a.name.localeCompare(b.name);
		});
		let i = 0;
		for (const bg of bgs) {
			content += `<input type="checkbox" id="${i}" name="bg" value="${bg.uuid}"></input><label for="bg"><a class="control showuuid" uuid="${bg.uuid}">${bg.name}</a></label><br>`;
			i++;
		}

		content += `</div>`;

		let chosenBackground = undefined;
		let result = await Dialog.wait({
		  title: "Select Background",
		  content: content,
		  buttons: {
			ok: {
			  label: "OK",
			  icon: '<i class="fas fa-angles-right"></i>',
			  callback: async (html) => {
				for (i = 0; i < bgs.length; i++) {
					let cb = html.find(`#${i}`);
					if (cb[0].checked) {
						chosenBackground = bgs[i].background;
						const item = await fromUuid(bgs[i].uuid);
						if (item) {
							// FIX: should use call that executes advancement steps.
							actor.createEmbeddedDocuments("Item", [item]);
						} else {
							throw new Error(`Could not get item ${$bg[i].uuid}`);
						}
						break;
					}
				}
				return count > 0;
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
		return chosenBackground;
	}

	async pointBuy(actor) {
		this.actor = actor;

		if (actor.system.details.level > 0) {
			Dialog.prompt({
				title: "Character Level Too High",
				content: `<p>Only level 0 characters can use Build Character.</p>
				<p>${actor.name} is level ${actor.system.details.level}</p>`,
				label: "OK"
			});
			return false;
		}

		let races = this.actor.items.filter(it => it.type == 'feat' && this.isRace(it.name));

		let prepend = '';

		if (races.length == 0) {
				prepend = `<p>There are no recognized races in Features.</p>
				<p>If there are any racial bonuses for any abilities you will need to enter them manually in the <b>Racial Bonus</b> field for those abilities.`;
		}
		
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
			content += `<p>${this.choose}</p>`;
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

		let dlg = await Dialog.wait({
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
