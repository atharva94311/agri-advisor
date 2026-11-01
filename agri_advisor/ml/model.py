"""Harvest model definition.

`build_model()` returns an unfitted estimator:

    model.fit(X, Y)
        X : pandas.DataFrame, columns = agronomy.MODEL_COLUMNS
            (numeric features + one-hot crop / soil_type / season; see agronomy.py)
        Y : pandas.DataFrame, columns = agronomy.TARGETS, in this order:
            days_to_harvest        days from the observation date to the optimal harvest day (negative = overdue)
            harvest_readiness      0..1, how good it is to harvest on that day
            crop_health_index      0..1
            maturity_pct           0..150, % of required growing degree days accumulated
            expected_yield_kg_ha   expected yield if harvested at the optimal time

    model.predict(X) -> array-like of shape (n_rows, 5), columns in the TARGETS order above.

The fitted model is saved with joblib, so anything returned here must be picklable.
"""
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.multioutput import MultiOutputRegressor


def build_model():
    # One gradient-boosted tree model per target. Fast on CPU, handles the mixed feature scales without
    # preprocessing, and uses early stopping on an internal validation split.
    return MultiOutputRegressor(
        HistGradientBoostingRegressor(max_iter=500, learning_rate=0.1, max_leaf_nodes=63, random_state=42),
        n_jobs=-1,
    )
