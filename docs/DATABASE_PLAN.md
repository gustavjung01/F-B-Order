# Database plan

Use a new Postgres database for Bep Si F&B only.

Do not run migrations on any existing Heroku app or existing database.

Created migration:

```text
db/migrations/001_initial_commerce.sql
```

Tables:

```text
customers
categories
products
recipes
recipe_items
orders
order_items
ai_recipe_jobs
```

Next implementation order:

1. Create a new database for this project.
2. Run the initial migration on that new database only.
3. Save shop profiles from the register page into `customers`.
4. Read account status from `customers` by Clerk user id.
5. Return wholesale prices only for approved customers.
6. Add an admin approval screen.
7. Create real orders in `orders` and `order_items`.
8. Run recipe AI in a separate worker so UI stays fast.

AI recipe jobs should use `ai_recipe_jobs` as the queue table.
