# Main-only CI policy

The protected CI workflows run on every push to `main` and every pull request targeting `main`.

Branch-pattern push triggers and migration path filters are intentionally forbidden so changes cannot enter `main` without the full Core, Catalog, and Migration gates.
