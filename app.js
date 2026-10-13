"use strict";
const KEY="petal-calorie-tracker-v2",OLD_KEY="petal-calorie-tracker-v1",cfg=window.PETAL_CONFIG||{},$=s=>document.querySelector(s);
const ui={prev:$("#previousDay"),next:$("#nextDay"),dateBtn:$("#datePickerButton"),picker:$("#datePicker"),dateEye:$("#dateEyebrow"),dateLabel:$("#dateLabel"),consumed:$("#consumedCalories"),goal:$("#goalCalories"),remaining:$("#remainingCalories"),ring:$("#progressRing"),percent:$("#progressPercent"),proteinValue:$("#proteinValue"),carbsValue:$("#carbsValue"),fatValue:$("#fatValue"),proteinBar:$("#proteinBar"),carbsBar:$("#carbsBar"),fatBar:$("#fatBar"),list:$("#entriesList"),empty:$("#emptyState"),add:$("#addEntryButton"),foodDialog:$("#foodDialog"),foodForm:$("#foodForm"),foodTitle:$("#foodDialogTitle"),search:$("#foodSearch"),results:$("#searchResults"),selected:$("#selectedFood"),selectedName:$("#selectedName"),selectedSource:$("#selectedSource"),grams:$("#portionGrams"),preview:$("#nutritionPreview"),clearSelected:$("#clearSelected"),manualName:$("#manualName"),manualProtein:$("#manualProtein"),manualCarbs:$("#manualCarbs"),manualFat:$("#manualFat"),foodError:$("#foodError"),settings:$("#settingsButton"),goalsDialog:$("#goalsDialog"),goalsForm:$("#goalsForm"),gCal:$("#goalCaloriesInput"),gProtein:$("#goalProteinInput"),gCarbs:$("#goalCarbsInput"),gFat:$("#goalFatInput"),gProteinRange:$("#goalProteinRange"),gCarbsRange:$("#goalCarbsRange"),gFatRange:$("#goalFatRange"),macroDonut:$("#macroDonut"),macroEquation:$("#macroEquation"),macroMatch:$("#macroMatch"),proteinCalories:$("#proteinCalories"),carbsCalories:$("#carbsCalories"),fatCalories:$("#fatCalories"),bunnyMood:$("#bunnyMood"),bunnySprite:$("#bunnySprite"),bunnyFallback:$("#bunnySpriteFallback"),bunnyTitle:$("#bunnyMoodTitle"),bunnyCopy:$("#bunnyMoodCopy"),goalsError:$("#goalsError"),deleteDialog:$("#deleteDialog"),accountBtn:$("#accountButton"),accountDialog:$("#accountDialog"),authForm:$("#authForm"),authEmail:$("#authEmail"),authError:$("#authError"),signedOut:$("#signedOutPanel"),signedIn:$("#signedInPanel"),userEmail:$("#userEmail"),signOut:$("#signOutButton"),avatar:$("#avatarLetter"),saveStatus:$("#saveStatus"),toast:$("#toast")};
let state=loadState(),selectedDate=todayKey(),selectedFood=null,editingId=null,pendingDelete=null,searchTimer=null,searchController=null,toastTimer=null,syncTimer=null,supabaseClient=null,currentUser=null,goalDraft=null,goalLocks=[];
function cleanState(raw){const goals=raw?.goals||{calories:Number(raw?.goal)||2000,protein:120,carbs:250,fat:65};return{goals:{calories:num(goals.calories,2000),protein:num(goals.protein,120),carbs:num(goals.carbs,250),fat:num(goals.fat,65)},entries:raw?.entries&&typeof raw.entries==="object"?raw.entries:{}}}
function loadState(){try{const current=localStorage.getItem(KEY),legacy=localStorage.getItem(OLD_KEY);return cleanState(JSON.parse(current||legacy||"null"))}catch{return cleanState(null)}}function num(value,fallback=0){const n=Number(value);return Number.isFinite(n)?n:fallback}function persist(){localStorage.setItem(KEY,JSON.stringify(state));if(currentUser&&supabaseClient){clearTimeout(syncTimer);syncTimer=setTimeout(syncCloud,700)}}function dateKey(d){return[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")}function todayKey(){return dateKey(new Date())}function fromKey(k){const[y,m,d]=k.split("-").map(Number);return new Date(y,m-1,d,12)}function dayEntries(){return Array.isArray(state.entries[selectedDate])?state.entries[selectedDate]:[]}function fmt(v,d=0){return num(v).toLocaleString(undefined,{maximumFractionDigits:d})}function escapeId(value){return String(value).replace(/"/g,"&quot;")}
function totals(items){return items.reduce((t,x)=>({calories:t.calories+num(x.calories),protein:t.protein+num(x.protein),carbs:t.carbs+num(x.carbs),fat:t.fat+num(x.fat)}),{calories:0,protein:0,carbs:0,fat:0})}
const KCAL_PER_GRAM={protein:4,carbs:4,fat:9},MACROS=["protein","carbs","fat"];
function macroEnergy(goals,name){return num(goals[name])*KCAL_PER_GRAM[name]}
function tidyGoal(value){return Math.round(Math.max(0,num(value)))}
function wholeMacroSplit(calories,target,changed=null,holds=[]){
  let best=null,bestScore=Infinity;
  const weights={protein:1,carbs:1,fat:1};holds.forEach(name=>weights[name]=10000);if(changed)weights[changed]=100000;
  for(let fat=calories%4;fat*9<=calories;fat+=4){
    const pcTotal=(calories-fat*9)/4;
    const points=[0,pcTotal,Math.round(target.protein),Math.round(pcTotal-target.carbs)];
    const candidates=new Set(points.flatMap(point=>[-2,-1,0,1,2].map(delta=>Math.max(0,Math.min(pcTotal,point+delta)))));
    for(const protein of candidates){
      const carbs=pcTotal-protein,score=weights.protein*Math.abs(protein-target.protein)+weights.carbs*Math.abs(carbs-target.carbs)+weights.fat*Math.abs(fat-target.fat);
      if(score<bestScore){bestScore=score;best={calories,protein,carbs,fat}}
    }
  }
  return best
}
function rebalanceGoals(source,changed=null,wanted=null,holds=[]){
  const calories=Math.min(20000,Math.max(500,Math.round(num(source.calories,2000))));
  const target={protein:Math.max(0,num(source.protein)),carbs:Math.max(0,num(source.carbs)),fat:Math.max(0,num(source.fat))};
  if(!changed){
    const current=target.protein*4+target.carbs*4+target.fat*9;
    if(current>0)MACROS.forEach(name=>target[name]=target[name]*calories/current);
    else{target.protein=calories*.3/4;target.carbs=calories*.4/4;target.fat=calories*.3/9}
  }else target[changed]=Math.min(tidyGoal(wanted),Math.floor(calories/KCAL_PER_GRAM[changed]));
  return wholeMacroSplit(calories,target,changed,[...new Set([...holds,changed])].slice(-2))
}
function goalInputValue(value){return String(Math.round(value))}
function renderGoalPlanner(){
  const g=goalDraft,total=MACROS.reduce((sum,name)=>sum+macroEnergy(g,name),0);
  ui.gCal.value=g.calories;
  MACROS.forEach(name=>{
    const field=ui[`g${name[0].toUpperCase()+name.slice(1)}`],range=ui[`g${name[0].toUpperCase()+name.slice(1)}Range`],energy=macroEnergy(g,name);
    field.value=goalInputValue(g[name]);range.max=String(Math.floor(g.calories/KCAL_PER_GRAM[name]));range.value=goalInputValue(g[name]);
    ui[`${name}Calories`].textContent=`${fmt(energy)} kcal · ${Math.round(energy/g.calories*100)}%`
  });
  const proteinPct=macroEnergy(g,"protein")/g.calories*100,carbsPct=macroEnergy(g,"carbs")/g.calories*100;
  ui.macroDonut.style.background=`conic-gradient(#6f493f 0 ${proteinPct}%,#d57f9b ${proteinPct}% ${proteinPct+carbsPct}%,#e7b6ad ${proteinPct+carbsPct}% 100%)`;
  ui.macroDonut.setAttribute("aria-label",`Protein ${Math.round(proteinPct)} percent, carbs ${Math.round(carbsPct)} percent, fat ${Math.round(100-proteinPct-carbsPct)} percent`);
  ui.macroEquation.textContent=`${goalInputValue(g.protein)}g P × 4 + ${goalInputValue(g.carbs)}g C × 4 + ${goalInputValue(g.fat)}g F × 9`;
  ui.macroMatch.textContent=`${fmt(total)} kcal total — exactly on target ✓`;document.querySelectorAll("[data-lock]").forEach(button=>{const held=goalLocks.includes(button.dataset.lock);button.classList.toggle("active",held);button.setAttribute("aria-pressed",String(held));button.textContent=held?"Held ✓":"Hold"})
}
function updateGoalPlanner(name,value){
  ui.goalsError.textContent="";
  if(name==="calories"){goalLocks=[];goalDraft={...goalDraft,calories:value};goalDraft=rebalanceGoals(goalDraft)}
  else{
    goalLocks=goalLocks.filter(item=>item!==name);goalLocks.push(name);if(goalLocks.length>2)goalLocks.shift();
    goalDraft=rebalanceGoals(goalDraft,name,value,goalLocks)
  }
  renderGoalPlanner()
}
const BUNNY_SPRITES=cfg.bunnySprites||{sleepy:"",strong:"",sad:""};
const BUNNY_MOODS={
  sleepy:{title:"Sleepy little bun",copy:"Log a meal to help your bunny wake up.",icon:"☾"},
  strong:{title:"Protein power!",copy:"Your bunny feels strong and ready to hop.",icon:"✦"},
  sad:{title:"A little overstuffed",copy:"Over today’s calorie goal — tomorrow is a fresh start.",icon:"♡"}
};
function bunnyState(total,goals){if(total.calories>goals.calories)return"sad";if(goals.protein>0&&total.protein/goals.protein>=.75)return"strong";return"sleepy"}
function preloadBunnySprites(){Object.values(BUNNY_SPRITES).filter(Boolean).forEach(src=>{const image=new Image();image.src=src})}
function renderBunny(total,goals){
  const state=bunnyState(total,goals),mood=BUNNY_MOODS[state],src=BUNNY_SPRITES[state];
  ui.bunnyMood.className=`bunny-mood ${state}`;ui.bunnyTitle.textContent=mood.title;ui.bunnyCopy.textContent=mood.copy;
  ui.bunnyFallback.querySelector("span").textContent=mood.icon;ui.bunnyFallback.querySelector("small").textContent=`${state} sprite ready for chosen style`;
  if(!src){ui.bunnySprite.hidden=true;ui.bunnyFallback.hidden=false;return}
  if(ui.bunnySprite.dataset.src===src){ui.bunnySprite.hidden=false;ui.bunnyFallback.hidden=true;return}
  const loader=new Image();loader.onload=()=>{ui.bunnySprite.src=src;ui.bunnySprite.alt=`${mood.title} bunny`;ui.bunnySprite.dataset.src=src;ui.bunnySprite.hidden=false;ui.bunnyFallback.hidden=true};loader.onerror=()=>{ui.bunnySprite.hidden=true;ui.bunnyFallback.hidden=false};loader.src=src
}
function render(){renderDate();const items=dayEntries(),t=totals(items),g=state.goals,pct=g.calories?t.calories/g.calories*100:0,diff=g.calories-t.calories;ui.consumed.textContent=fmt(t.calories);ui.goal.textContent=fmt(g.calories);ui.percent.textContent=`${Math.round(pct)}%`;ui.remaining.textContent=diff>=0?`${fmt(diff)} calories left`:`${fmt(Math.abs(diff))} calories over goal`;ui.ring.style.setProperty("--progress",`${Math.min(pct,100)*3.6}deg`);ui.ring.setAttribute("aria-valuenow",Math.min(Math.round(pct),100));renderMacro("protein",t.protein,g.protein);renderMacro("carbs",t.carbs,g.carbs);renderMacro("fat",t.fat,g.fat);renderBunny(t,g);renderEntries(items)}
function renderMacro(name,value,goal){ui[`${name}Value`].textContent=`${fmt(value,1)} / ${fmt(goal)}g`;ui[`${name}Bar`].style.width=`${Math.min(goal?value/goal*100:0,100)}%`}
function renderDate(){const date=fromKey(selectedDate),today=todayKey(),y=new Date(),tom=new Date();y.setDate(y.getDate()-1);tom.setDate(tom.getDate()+1);ui.dateEye.textContent=selectedDate===today?"Today":selectedDate===dateKey(y)?"Yesterday":selectedDate===dateKey(tom)?"Tomorrow":"Selected day";ui.dateLabel.textContent=date.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"});ui.picker.value=selectedDate;$("#entriesTitle").textContent=selectedDate===today?"Today’s food":"Daily food"}
function renderEntries(items){ui.empty.hidden=items.length>0;ui.list.innerHTML="";items.forEach(item=>{const card=document.createElement("article");card.className="entry-card";card.innerHTML=`<div class="food-icon">♡</div><div class="entry-info"><h3></h3><p>${fmt(item.grams,0)}g · P ${fmt(item.protein,1)}g · C ${fmt(item.carbs,1)}g · F ${fmt(item.fat,1)}g</p></div><div class="entry-calories"><strong>${fmt(item.calories)}</strong><small>kcal</small></div><div class="entry-actions"><button class="entry-action" data-action="edit" data-id="${escapeId(item.id)}">Edit</button><button class="entry-action" data-action="delete" data-id="${escapeId(item.id)}">Delete</button></div>`;card.querySelector("h3").textContent=item.name;ui.list.appendChild(card)})}
function shiftDay(amount){const d=fromKey(selectedDate);d.setDate(d.getDate()+amount);selectedDate=dateKey(d);render()}function clearFoodForm(){ui.foodForm.reset();ui.grams.value=100;ui.results.innerHTML="";ui.selected.hidden=true;ui.search.closest(".search-box").hidden=false;selectedFood=null;editingId=null;ui.foodError.textContent="";switchTab("search")}function openFood(item=null){clearFoodForm();if(item){editingId=item.id;ui.foodTitle.textContent="Edit food";switchTab("manual");ui.manualName.value=item.name;ui.manualProtein.value=item.protein;ui.manualCarbs.value=item.carbs;ui.manualFat.value=item.fat}else ui.foodTitle.textContent="Add food";ui.foodDialog.showModal()}
function switchTab(name){document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===name));$("#searchPanel").hidden=name!=="search";$("#manualPanel").hidden=name!=="manual"}
function nutrient(food,matcher){const found=(food.foodNutrients||[]).find(n=>matcher.test(n.nutrientName||n.nutrient?.name||""));return num(found?.value??found?.amount)}
function normalizeFood(food){return{id:food.fdcId,name:food.description||"Unknown food",source:food.dataType||"USDA",calories:nutrient(food,/^Energy$|Energy \(Atwater/i),protein:nutrient(food,/^Protein$/i),carbs:nutrient(food,/Carbohydrate, by difference/i),fat:nutrient(food,/Total lipid \(fat\)/i)}}
const STAPLE_FOODS=[["Chicken breast, cooked",0,31,0,3.6],["Chicken thigh, cooked",0,26,0,10.9],["Ground beef, 90% lean, cooked",0,26,0,10],["Salmon, cooked",0,25,0,13],["Egg, whole",0,13,1.1,11],["Egg white",0,11,0.7,0.2],["Greek yogurt, plain nonfat",0,10,3.6,0.4],["Cottage cheese, low-fat",0,11,4,2],["Milk, 2%",0,3.4,4.8,2],["Tofu, firm",0,8,2,4.8],["White rice, cooked",0,2.7,28,0.3],["Brown rice, cooked",0,2.6,23,0.9],["Quinoa, cooked",0,4.4,21,1.9],["Oats, dry",0,13,68,7],["Whole wheat bread",0,13,41,4],["Sweet potato, baked",0,2,20,0.1],["Potato, baked",0,2,21,0.1],["Green beans, cooked",0,1.8,7,0.2],["Broccoli, cooked",0,2.8,7,0.4],["Spinach, cooked",0,3,3.6,0.3],["Carrots, raw",0,0.9,10,0.2],["Banana",0,1.1,23,0.3],["Apple",0,0.3,14,0.2],["Blueberries",0,0.7,14,0.3],["Strawberries",0,0.7,8,0.3],["Avocado",0,2,9,15],["Almonds",0,21,22,50],["Peanut butter",0,25,20,50],["Olive oil",0,0,0,100],["Black beans, cooked",0,9,24,0.5],["Lentils, cooked",0,9,20,0.4],["Chickpeas, cooked",0,9,27,2.6],["Salmon fillet, raw",0,20,0,13],["Shrimp, cooked",0,24,0,0.3],["Turkey breast, cooked",0,30,0,1],["Pasta, cooked",0,5,25,1],["Cheddar cheese",0,25,1.3,33],["Protein powder, whey",0,80,8,4]].map(([name,,protein,carbs,fat],i)=>({id:`staple-${i}`,name,source:"Built-in",protein,carbs,fat,calories:protein*4+carbs*4+fat*9}));
function searchStaples(query){const q=query.trim().toLowerCase();return STAPLE_FOODS.filter(f=>f.name.toLowerCase().includes(q))}
async function searchFoods(query){
  if(query.trim().length<2){ui.results.innerHTML="";return}
  searchController?.abort();searchController=new AbortController();
  const staples=searchStaples(query);
  showResults(staples,staples.length?"":"Searching the food database…");
  try{
    const key=encodeURIComponent(cfg.usdaApiKey||"DEMO_KEY"),url=`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${key}&query=${encodeURIComponent(query)}&pageSize=20&dataType=Foundation,SR%20Legacy,Survey%20(FNDDS),Branded`,res=await fetch(url,{signal:searchController.signal});
    if(!res.ok)throw new Error("Food search is temporarily unavailable.");
    const data=await res.json(),remote=(data.foods||[]).map(normalizeFood).filter(f=>f.calories||f.protein||f.carbs||f.fat),names=new Set(staples.map(f=>f.name.toLowerCase())),combined=[...staples,...remote.filter(f=>!names.has(f.name.toLowerCase()))];
    showResults(combined,combined.length?"":"No matches found. Try a simpler search.")
  }catch(error){
    if(error.name==="AbortError")return;
    showResults(staples,staples.length?"Live search unavailable — showing built-in results.":"Couldn’t reach the food database. Try again or use “Add manually.”")
  }
}
function showResults(foods,hint=""){ui.results.innerHTML="";if(hint)ui.results.innerHTML=`<p class="search-hint">${hint}</p>`;if(!foods.length)return;foods.forEach(food=>{const b=document.createElement("button");b.type="button";b.className="search-result";b.innerHTML=`<div><strong></strong><small>${food.source} · P ${fmt(food.protein,1)}g · C ${fmt(food.carbs,1)}g · F ${fmt(food.fat,1)}g</small></div><b>${fmt(food.calories)} kcal</b>`;b.querySelector("strong").textContent=food.name;b.addEventListener("click",()=>selectFood(food));ui.results.appendChild(b)})}
function selectFood(food){selectedFood=food;ui.selectedName.textContent=food.name;ui.selectedSource.textContent=`${food.source} · nutrient values per 100g`;ui.results.innerHTML="";ui.search.closest(".search-box").hidden=true;ui.selected.hidden=false;renderPreview()}function scaledFood(){const factor=Math.max(0,num(ui.grams.value))/100;return{calories:selectedFood.calories*factor,protein:selectedFood.protein*factor,carbs:selectedFood.carbs*factor,fat:selectedFood.fat*factor}}function renderPreview(){if(!selectedFood)return;const x=scaledFood();ui.preview.innerHTML=[["Calories",fmt(x.calories)],["Protein",`${fmt(x.protein,1)}g`],["Carbs",`${fmt(x.carbs,1)}g`],["Fat",`${fmt(x.fat,1)}g`]].map(([a,b])=>`<div><b>${b}</b><small>${a}</small></div>`).join("")}
function saveEntry(item){const items=dayEntries();if(editingId){const index=items.findIndex(x=>x.id===editingId);if(index>=0)items[index]={...item,id:editingId}}else items.push({...item,id:crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`});state.entries[selectedDate]=items;persist();ui.foodDialog.close();render();toast(editingId?"Food updated":"Food added")}
function toast(message){clearTimeout(toastTimer);ui.toast.textContent=message;ui.toast.classList.add("show");toastTimer=setTimeout(()=>ui.toast.classList.remove("show"),1900)}
ui.prev.addEventListener("click",()=>shiftDay(-1));ui.next.addEventListener("click",()=>shiftDay(1));ui.dateBtn.addEventListener("click",()=>ui.picker.showPicker?.()||ui.picker.click());ui.picker.addEventListener("change",()=>{if(ui.picker.value){selectedDate=ui.picker.value;render()}});ui.add.addEventListener("click",()=>openFood());document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>document.getElementById(b.dataset.close).close()));document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>switchTab(b.dataset.tab)));ui.search.addEventListener("input",()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>searchFoods(ui.search.value),350)});ui.clearSelected.addEventListener("click",()=>{selectedFood=null;ui.selected.hidden=true;ui.search.closest(".search-box").hidden=false;ui.search.focus()});ui.grams.addEventListener("input",renderPreview);
ui.foodForm.addEventListener("submit",event=>{event.preventDefault();ui.foodError.textContent="";if(!$("#searchPanel").hidden){if(!selectedFood||num(ui.grams.value)<=0){ui.foodError.textContent="Choose a food and enter a valid weight.";return}const macros=scaledFood();saveEntry({name:selectedFood.name,grams:num(ui.grams.value),sourceId:selectedFood.id,...macros})}else{const name=ui.manualName.value.trim(),fields=[ui.manualProtein,ui.manualCarbs,ui.manualFat];if(!name||fields.some(x=>x.value!==""&&num(x.value)<0)){ui.foodError.textContent="Add a name and valid nutrition values.";return}const protein=num(ui.manualProtein.value),carbs=num(ui.manualCarbs.value),fat=num(ui.manualFat.value);saveEntry({name,grams:0,calories:protein*4+carbs*4+fat*9,protein,carbs,fat})}});
ui.settings.addEventListener("click",()=>{ui.goalsError.textContent="";goalLocks=[];goalDraft=rebalanceGoals(state.goals);renderGoalPlanner();ui.goalsDialog.showModal()});
ui.gCal.addEventListener("change",()=>updateGoalPlanner("calories",ui.gCal.value));
MACROS.forEach(name=>{
  const cap=name[0].toUpperCase()+name.slice(1),field=ui[`g${cap}`],range=ui[`g${cap}Range`];
  range.addEventListener("input",()=>updateGoalPlanner(name,range.value));
  field.addEventListener("change",()=>{if(field.value!=="")updateGoalPlanner(name,field.value)});
});
document.querySelectorAll("[data-lock]").forEach(button=>button.addEventListener("click",()=>{
  const name=button.dataset.lock;goalLocks=goalLocks.includes(name)?goalLocks.filter(item=>item!==name):[...goalLocks,name].slice(-2);renderGoalPlanner()
}));
$("#resetMacroBalance").addEventListener("click",()=>{goalLocks=[];renderGoalPlanner()});
ui.goalsForm.addEventListener("submit",event=>{event.preventDefault();if(!goalDraft||goalDraft.calories<500||MACROS.some(name=>goalDraft[name]<0)){ui.goalsError.textContent="Please enter valid goals.";return}state.goals={calories:goalDraft.calories,protein:tidyGoal(goalDraft.protein),carbs:tidyGoal(goalDraft.carbs),fat:goalDraft.fat};persist();ui.goalsDialog.close();render();toast("Macro goals saved")});
ui.list.addEventListener("click",event=>{const b=event.target.closest("[data-action]");if(!b)return;const item=dayEntries().find(x=>x.id===b.dataset.id);if(!item)return;if(b.dataset.action==="edit")openFood(item);else{pendingDelete=item.id;ui.deleteDialog.showModal()}});ui.deleteDialog.addEventListener("close",()=>{if(ui.deleteDialog.returnValue==="confirm"&&pendingDelete){state.entries[selectedDate]=dayEntries().filter(x=>x.id!==pendingDelete);if(!state.entries[selectedDate].length)delete state.entries[selectedDate];persist();render();toast("Food removed")}pendingDelete=null});
async function initAuth(){if(!cfg.supabaseUrl||!cfg.supabaseAnonKey||!window.supabase)return;supabaseClient=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);const{data}=await supabaseClient.auth.getSession();await applySession(data.session);supabaseClient.auth.onAuthStateChange((_event,session)=>setTimeout(()=>applySession(session),0))}
async function applySession(session){currentUser=session?.user||null;ui.signedOut.hidden=!!currentUser;ui.signedIn.hidden=!currentUser;if(currentUser){ui.userEmail.textContent=currentUser.email;ui.avatar.textContent=(currentUser.email||"A")[0].toUpperCase();ui.saveStatus.textContent="♡ Synced to Aaliyah’s account";const cloud=currentUser.user_metadata?.petal_state;if(cloud?.entries&&Object.keys(cloud.entries).length){state=cleanState(cloud);localStorage.setItem(KEY,JSON.stringify(state));render()}else await syncCloud()}else{ui.avatar.textContent="A";ui.saveStatus.textContent="♡ Saved on this device"}}
async function syncCloud(){if(!currentUser||!supabaseClient)return;const{error}=await supabaseClient.auth.updateUser({data:{petal_state:state}});if(error)console.warn("Petal sync failed:",error.message)}
ui.accountBtn.addEventListener("click",()=>{ui.authError.textContent="";if(!supabaseClient)ui.authError.textContent="Account sync needs Supabase settings in config.js. Device-only mode is ready now.";ui.accountDialog.showModal()});ui.authForm.addEventListener("submit",async event=>{event.preventDefault();if(!supabaseClient)return;ui.authError.textContent="Sending…";const{error}=await supabaseClient.auth.signInWithOtp({email:ui.authEmail.value,options:{emailRedirectTo:location.href.split("#")[0]}});ui.authError.textContent=error?error.message:"Magic link sent — check your email!"});ui.signOut.addEventListener("click",async()=>{await supabaseClient?.auth.signOut();ui.accountDialog.close();toast("Signed out")});
[ui.foodDialog,ui.goalsDialog,ui.accountDialog].forEach(dialog=>dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close()}));preloadBunnySprites();render();initAuth();
