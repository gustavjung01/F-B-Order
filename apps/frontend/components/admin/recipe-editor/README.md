# Recipe editor V5

`AdminRecipeOperationsPanelV5` is the orchestration layer. It owns authentication, loading, saving, workflow calls, dirty state, upload state and dialog selection.

UI responsibilities stay split by surface:

- `RecipeOverviewTab`: core fields and cover media.
- `RecipeIngredientsTab`: ingredient editing and reordering.
- `RecipeStepsTab`: step editing, reordering and upload entry points.
- `RecipePublishTab`: readiness, review notes and version history.
- `RecipePickerDialogs`: catalog and thumbnail media selection.
- `RecipeEditorChrome`: tab navigation, completion bar, controls and undo toast.
- `RecipeEditorFooter`: the single workflow action surface.
- `types`: domain types, validation, completion rules and reorder helpers.

Do not move tab JSX or picker search results back into the orchestration component. Workflow actions must remain in the footer so their availability is derived from one status contract.
