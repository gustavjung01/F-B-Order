import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");
const dataDir = path.join(root, "data/recipes/bepsi-recipes-v1");
const imageDir = process.env.RECIPE_IMAGE_DIR || "F:/1_A_Disk_D/khuong-binh/bep-si/image/recipes";

const readJson = async (name) => JSON.parse(await fs.readFile(path.join(dataDir, name), "utf8"));
const recipesDoc = await readJson("recipes.standard.json");
const imageDoc = await readJson("image-map.json");
const catalogDoc = await readJson("catalog-map.json");
const validationDoc = await readJson("validation.json");

const errors = [];
const warnings = [];
const recipes = recipesDoc.recipes || [];
const categories = recipesDoc.categories || [];
const slugs = new Set(recipes.map((recipe) => recipe.slug));

if (recipes.length !== 64) errors.push(`Expected 64 recipes, found ${recipes.length}`);
if (categories.length !== 12) errors.push(`Expected 12 categories, found ${categories.length}`);
if (slugs.size !== recipes.length) errors.push("Recipe slugs are not unique");

let ingredientCount = 0;
let stepCount = 0;
let recipeLinks = 0;
let catalogCandidates = 0;
let manualIngredients = 0;

for (const recipe of recipes) {
  ingredientCount += recipe.ingredients?.length || 0;
  stepCount += recipe.steps?.length || 0;
  for (const ingredient of recipe.ingredients || []) {
    if (ingredient.sourceType === "recipe") {
      recipeLinks += 1;
      if (!ingredient.sourceRecipeSlug || !slugs.has(ingredient.sourceRecipeSlug)) {
        errors.push(`${recipe.slug}: invalid source recipe ${ingredient.sourceRecipeSlug || "<missing>"}`);
      }
    } else if (ingredient.sourceType === "catalog_candidate") {
      catalogCandidates += 1;
      if (!ingredient.catalogKey || !catalogDoc.entries?.[ingredient.catalogKey]) {
        errors.push(`${recipe.slug}: missing catalog map for ${ingredient.catalogKey || "<missing>"}`);
      }
    } else if (ingredient.sourceType === "manual") {
      manualIngredients += 1;
    } else {
      errors.push(`${recipe.slug}: unsupported sourceType ${ingredient.sourceType}`);
    }
  }
}

const imageEntries = imageDoc.entries || [];
const imageEntryBySlug = new Map(imageEntries.map((entry) => [entry.recipeSlug, entry]));
if (imageEntries.length !== recipes.length) errors.push(`Expected ${recipes.length} image entries, found ${imageEntries.length}`);

let mappedImages = 0;
let missingImages = 0;
for (const recipe of recipes) {
  const entry = imageEntryBySlug.get(recipe.slug);
  if (!entry) {
    errors.push(`${recipe.slug}: missing image manifest entry`);
    continue;
  }
  if (entry.fileName) {
    mappedImages += 1;
    try {
      await fs.access(path.join(imageDir, entry.fileName));
    } catch {
      errors.push(`${recipe.slug}: image file not found: ${entry.fileName}`);
    }
  } else {
    missingImages += 1;
    if (recipe.visibility !== "internal") warnings.push(`${recipe.slug}: public recipe has no image`);
  }
}

const catalogKeys = Object.keys(catalogDoc.entries || {});
if (catalogKeys.length !== 33) errors.push(`Expected 33 catalog keys, found ${catalogKeys.length}`);

const expected = validationDoc.summary || {};
if (expected.recipes && expected.recipes !== recipes.length) errors.push("Validation summary recipe count differs");
if (expected.ingredients && expected.ingredients !== ingredientCount) errors.push("Validation summary ingredient count differs");
if (expected.steps && expected.steps !== stepCount) errors.push("Validation summary step count differs");

console.log(JSON.stringify({
  ok: errors.length === 0,
  recipes: recipes.length,
  categories: categories.length,
  ingredients: ingredientCount,
  steps: stepCount,
  recipeLinks,
  catalogCandidates,
  catalogKeys: catalogKeys.length,
  manualIngredients,
  mappedImages,
  recipesWithoutImages: missingImages,
  warnings,
  errors,
}, null, 2));

if (errors.length) process.exit(1);
