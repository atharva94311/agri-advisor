"""Crop profiles: agronomic parameters and each crop's name in the source datasets.

Values are approximate textbook figures for Indian varieties. Both the dataset simulation and inference
use them, so changing one means rebuilding the dataset and retraining.
"""
from dataclasses import dataclass, field


@dataclass(frozen=True)
class CropProfile:
    name: str
    season: str                       # kharif | rabi | zaid
    sow_windows: tuple                # ((month, day), (month, day)) pairs
    duration_days: int                # typical sowing -> physiological maturity
    t_base: float                     # base temperature for growing degree days (deg C)
    t_cap: float                      # temperature above which extra heat adds no development
    ref_temp: float                   # season-mean temperature the duration was calibrated at
    window_frac: float                # harvest window width, as a fraction of required GDD
    decay_frac: float                 # how fast quality drops after the window (shattering / over-ripening)
    heat_tmax: float                  # daily max temp above which the crop is heat stressed
    cold_tmin: float                  # daily min temp below which the crop is cold stressed
    moisture_min: float               # soil moisture (%) below which the crop is water stressed
    moisture_max: float               # soil moisture (%) above which the crop is waterlogged
    rain_harvest_sensitivity: float   # 0..1, how much rain at harvest hurts
    irrigated_prob: float             # share of Indian area that is irrigated (used in simulation)
    # Source name mappings
    croprec_label: str | None         # Crop_recommendation.csv `label`
    fert_crop_type: str | None        # Fertilizer Prediction.csv `Crop Type`
    production_names: tuple = ()      # crop_production.csv `Crop`
    production_unit_kg: float = 1000  # kg per production unit (tonnes, or bales for cotton)
    mandi_commodities: tuple = ()     # data.gov.in / Agmarknet `commodity` names (exact, checked live)
    fallback_yield_kg_ha: float = 1000  # used when crop_production.csv has no usable yield for the crop
    climate_prior: dict = field(default_factory=dict)  # used when the crop is missing from crop_recommendation

    @property
    def gdd_maturity(self) -> float:
        return self.duration_days * max(1.0, min(self.ref_temp, self.t_cap) - self.t_base)


CROPS: dict[str, CropProfile] = {c.name: c for c in [
    CropProfile("rice", "kharif", (((6, 10), (7, 25)),), 120, 10, 35, 23.7, 0.08, 0.10, 38, 12, 35, 100, 0.6, 0.6,
                "rice", "Paddy", ("Rice",), 1000, ("Paddy(Common)",)),  # farmers sell paddy
    CropProfile("maize", "kharif", (((6, 10), (7, 20)),), 100, 10, 30, 22.8, 0.08, 0.12, 38, 8, 25, 80, 0.5, 0.35,
                "maize", "Maize", ("Maize",), 1000, ("Maize",)),
    CropProfile("wheat", "rabi", (((10, 25), (12, 10)),), 130, 0, 26, 18.0, 0.06, 0.08, 34, -2, 25, 80, 0.7, 0.9,
                None, "Wheat", ("Wheat",), 1000, ("Wheat",),
                climate_prior={"N": (80, 120), "ph": (6.0, 7.5),
                               "temperature": (15, 21), "humidity": (45, 70)}),
    CropProfile("cotton", "kharif", (((5, 15), (7, 5)),), 160, 15, 35, 24.0, 0.15, 0.15, 40, 10, 20, 75, 0.8, 0.35,
                "cotton", "Cotton", ("Cotton(lint)",), 170, ("Cotton",)),
    CropProfile("chickpea", "rabi", (((10, 10), (11, 20)),), 105, 5, 30, 18.9, 0.07, 0.08, 35, 2, 20, 70, 0.6, 0.3,
                "chickpea", "Pulses", ("Gram",), 1000, ("Bengal Gram(Gram)(Whole)",)),
    CropProfile("lentil", "rabi", (((10, 15), (11, 25)),), 110, 5, 30, 24.9, 0.07, 0.07, 35, 2, 20, 70, 0.6, 0.3,
                "lentil", "Pulses", ("Masoor",), 1000, ("Lentil (Masur)(Whole)",)),
    CropProfile("pigeonpeas", "kharif", (((6, 10), (7, 15)),), 170, 10, 35, 28.9, 0.10, 0.10, 40, 5, 20, 75, 0.5, 0.2,
                "pigeonpeas", "Pulses", ("Arhar/Tur",), 1000, ("Red gram/Arhar/Tur(whole)",)),
    CropProfile("mungbean", "kharif", (((6, 20), (7, 20)), ((3, 1), (4, 10))), 65, 10, 35, 28.4, 0.08, 0.06, 40, 10, 20, 75, 0.7, 0.3,
                "mungbean", "Pulses", ("Moong(Green Gram)",), 1000, ("Green Gram (Moong)(Whole)",)),
    CropProfile("blackgram", "kharif", (((6, 20), (7, 25)),), 80, 10, 35, 29.7, 0.08, 0.06, 40, 10, 20, 75, 0.7, 0.25,
                "blackgram", "Pulses", ("Urad",), 1000, ("Black Gram (Urd Beans)(Whole)",)),
    CropProfile("mothbeans", "kharif", (((7, 1), (7, 31)),), 75, 10, 38, 28.4, 0.10, 0.08, 42, 10, 15, 70, 0.5, 0.1,
                "mothbeans", "Pulses", ("Moth",), 1000, ("Mataki",)),
    CropProfile("kidneybeans", "rabi", (((10, 15), (11, 15)),), 100, 8, 28, 19.9, 0.07, 0.07, 32, 3, 25, 75, 0.6, 0.4,
                "kidneybeans", "Pulses", ("Rajmash Kholar",), 1000, ()),
    CropProfile("jute", "zaid", (((3, 15), (5, 15)),), 120, 12, 35, 25.0, 0.10, 0.10, 40, 12, 30, 95, 0.3, 0.2,
                "jute", None, ("Jute",), 180, ("Jute",)),
    CropProfile("watermelon", "zaid", (((1, 20), (3, 15)),), 85, 10, 35, 25.6, 0.06, 0.06, 40, 10, 25, 75, 0.5, 0.6,
                "watermelon", None, ("Water Melon",), 1000, ("Water Melon",), fallback_yield_kg_ha=25000),
    # No muskmelon rows in crop_production.csv: watermelon districts are used as a proxy.
    CropProfile("muskmelon", "zaid", (((1, 20), (3, 15)),), 80, 10, 35, 28.9, 0.05, 0.05, 40, 10, 25, 75, 0.5, 0.6,
                "muskmelon", None, ("Water Melon",), 1000, ("Karbuja(Musk Melon)",), fallback_yield_kg_ha=15000),
]}

# Names farmers use (English + common Indian name), passed to the LLM so it names the crop correctly.
CROP_COMMON_NAMES = {
    "rice": "rice / paddy (dhaan, धान)", "maize": "maize (makka, मक्का)", "wheat": "wheat (gehun, गेहूं)",
    "cotton": "cotton (kapas, कपास)", "chickpea": "chickpea (chana, चना)", "lentil": "lentil (masoor, मसूर)",
    "pigeonpeas": "pigeon pea (arhar / tur, अरहर / तुअर)", "mungbean": "green gram (moong, मूंग)",
    "blackgram": "black gram (urad, उड़द)", "mothbeans": "moth bean (moth / matki, मोठ)",
    "kidneybeans": "kidney bean (rajma, राजमा)", "jute": "jute (pat / patsan, पटसन)",
    "watermelon": "watermelon (tarbooz, तरबूज)", "muskmelon": "muskmelon (kharbooja, खरबूजा)",
}

SOIL_TYPES = ("Black", "Clayey", "Loamy", "Red", "Sandy")
# Max plant-available moisture (%) per soil type, used by the soil water bucket model.
SOIL_CAPACITY = {"Sandy": 45.0, "Loamy": 60.0, "Red": 55.0, "Black": 70.0, "Clayey": 75.0}
SEASONS = ("kharif", "rabi", "zaid")

# Generic Indian monthly temperature anomaly relative to the annual mean (deg C), Jan..Dec.
MONTHLY_TEMP_ANOMALY = (-7.0, -4.5, 0.0, 4.0, 6.0, 4.5, 2.0, 1.5, 1.0, -0.5, -3.5, -6.5)


def get_crop(name: str) -> CropProfile:
    key = name.strip().lower()
    if key not in CROPS:
        raise KeyError(f"Unknown crop '{name}'. Supported: {', '.join(CROPS)}")
    return CROPS[key]
