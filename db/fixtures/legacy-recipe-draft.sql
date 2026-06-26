-- Minimal legacy Recipe draft schema that predates Recipe Core.
-- Deliberately omits recipe_category_id, visibility, updated_at and several
-- ingredient/step columns to reproduce the local migration failure.

CREATE TABLE recipe_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL
);

CREATE TABLE recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'needs_review',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  product_name TEXT,
  quantity NUMERIC(14,2),
  unit TEXT,
  optional BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE recipe_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  step_no INTEGER NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO recipe_categories(name,slug)
VALUES('Legacy Drinks','legacy-drinks');

INSERT INTO recipes(slug,title,status)
VALUES('legacy-tra-dao','Legacy Trà đào','needs_review');

INSERT INTO recipe_ingredients(recipe_id,product_name,quantity,unit,optional,sort_order)
SELECT id,'Siro đào',300,'ml',false,0
FROM recipes WHERE slug='legacy-tra-dao';

INSERT INTO recipe_steps(recipe_id,step_no,title,content)
SELECT id,1,'Pha','Khuấy đều nguyên liệu.'
FROM recipes WHERE slug='legacy-tra-dao';
