""""
Core explainable rule-based Risk Engine for AgniDrishti.
"""

from typing import Any, Dict, List, Tuple
import pandas as pd

from ml.risk.rules import (
    BUILDING_COUNT_HIGH_THRESHOLD,
    CONFIDENCE_HIGH_THRESHOLD,
    FRP_HIGH_THRESHOLD,
    FRP_MEDIUM_THRESHOLD,
    INDUSTRIAL_CRITICAL_DIST_M,
    INDUSTRIAL_WARNING_DIST_M,
    POINTS_BUILDINGS_HIGH,
    POINTS_BUILDINGS_MODERATE,
    POINTS_CROPLAND_FUEL,
    POINTS_FRP_HIGH,
    POINTS_FRP_LOW,
    POINTS_FRP_MEDIUM,
    POINTS_HIGH_CONFIDENCE,
    POINTS_INDUSTRIAL_CRITICAL,
    POINTS_INDUSTRIAL_WARNING,
    POINTS_NIGHT_FIRE,
    POINTS_ROAD_ADJACENT,
    POINTS_SETTLEMENT_CRITICAL,
    POINTS_SETTLEMENT_WARNING,
    POINTS_VEGETATION_FUEL,
    POINTS_WATER_DEDUCTION,
    RISK_LEVEL_LOW_MAX,
    RISK_LEVEL_MEDIUM_MAX,
    ROAD_ADJACENT_DIST_M,
    SETTLEMENT_CRITICAL_DIST_M,
    SETTLEMENT_WARNING_DIST_M,
    WATER_BARRIER_DIST_M,
    POPULATION_HIGH_THRESHOLD,
    POINTS_HIGH_POPULATION,
    POWERPLANT_CRITICAL_DIST_M,
    POINTS_POWERPLANT_CRITICAL,
    FRP_ZSCORE_HIGH,
    POINTS_FRP_ZSCORE_HIGH,
    FRP_ZSCORE_MODERATE,
    POINTS_FRP_ZSCORE_MODERATE,
    DEFAULT_MAX_DISTANCE_M,
    # Cluster density constants
    CLUSTER_DENSITY_HIGH,
    POINTS_CLUSTER_HIGH,
    CLUSTER_DENSITY_MODERATE,
    POINTS_CLUSTER_MODERATE,
)


class RiskEngine:
    """
    Evaluates fire event feature vectors using explainable, rule-based heuristics.
    Outputs:
    - risk_score: Float [0.0 - 100.0]
    - risk_level: 'LOW' | 'MEDIUM' | 'HIGH'
    - breakdown: Score contribution by pillar
    - reasons: Human-readable explanations
    """

    def __init__(self):
        pass

    def _evaluate_fire_intensity(
        self, f: Dict[str, Any]
    ) -> Tuple[float, List[str]]:
        score = 0.0
        reasons = []

        frp = float(f.get("frp", 0.0))
        if frp >= FRP_HIGH_THRESHOLD:
            score += POINTS_FRP_HIGH
            reasons.append(f"High fire radiative power (FRP: {frp:.1f} MW)")
        elif frp >= FRP_MEDIUM_THRESHOLD:
            score += POINTS_FRP_MEDIUM
            reasons.append(f"Moderate fire radiative power (FRP: {frp:.1f} MW)")
        elif frp > 0.0:
            score += POINTS_FRP_LOW
            reasons.append(f"Low fire intensity detected (FRP: {frp:.1f} MW)")

        conf = float(f.get("confidence_score", 0.0))
        if conf >= CONFIDENCE_HIGH_THRESHOLD:
            score += POINTS_HIGH_CONFIDENCE
            reasons.append(f"High satellite detection confidence ({int(conf * 100)}%)")

        is_night = int(f.get("is_night", 0))
        if is_night == 1:
            score += POINTS_NIGHT_FIRE
            reasons.append("Night-time fire detection (delayed response risk)")

        return min(40.0, score), reasons

    def _evaluate_industrial_hazard(
        self, f: Dict[str, Any]
    ) -> Tuple[float, List[str]]:
        score = 0.0
        reasons = []

        ind_dist = float(f.get("nearest_industrial_distance_m", 5000.0))
        ind_count = int(f.get("industrial_count", 0))

        if ind_count > 0 or ind_dist <= INDUSTRIAL_WARNING_DIST_M:
            if ind_dist <= INDUSTRIAL_CRITICAL_DIST_M:
                score += POINTS_INDUSTRIAL_CRITICAL
                reasons.append(
                    f"Critical industrial hazard zone within {ind_dist:.0f}m"
                )
            elif ind_dist <= INDUSTRIAL_WARNING_DIST_M:
                score += POINTS_INDUSTRIAL_WARNING
                reasons.append(
                    f"Proximity to industrial area (distance: {ind_dist:.0f}m)"
                )

        return min(30.0, score), reasons

    def _evaluate_human_vulnerability(
        self, f: Dict[str, Any]
    ) -> Tuple[float, List[str]]:
        score = 0.0
        reasons = []

        settle_dist = float(f.get("nearest_settlement_distance_m", 5000.0))
        settle_count = int(f.get("settlement_count", 0))

        if settle_count > 0 or settle_dist <= SETTLEMENT_WARNING_DIST_M:
            if settle_dist <= SETTLEMENT_CRITICAL_DIST_M:
                score += POINTS_SETTLEMENT_CRITICAL
                reasons.append(
                    f"Immediate settlement proximity (distance: {settle_dist:.0f}m)"
                )
            elif settle_dist <= SETTLEMENT_WARNING_DIST_M:
                score += POINTS_SETTLEMENT_WARNING
                reasons.append(
                    f"Nearby residential settlement (distance: {settle_dist:.0f}m)"
                )

        b_count = int(f.get("building_count", 0))
        b_dist = float(f.get("nearest_building_distance_m", 5000.0))

        if b_count >= BUILDING_COUNT_HIGH_THRESHOLD:
            score += POINTS_BUILDINGS_HIGH
            reasons.append(
                f"High building density nearby ({b_count} structures within search radius)"
            )
        elif b_count > 0 or b_dist <= 500.0:
            score += POINTS_BUILDINGS_MODERATE
            reasons.append(
                f"Structures identified in vicinity ({b_count} buildings, nearest {b_dist:.0f}m)"
            )

        return min(30.0, score), reasons

    def _evaluate_fuel_and_spread(
        self, f: Dict[str, Any]
    ) -> Tuple[float, List[str]]:
        score = 0.0
        reasons = []

        is_veg = int(f.get("is_vegetation", 0))
        is_crop = int(f.get("is_cropland", 0))

        if is_veg == 1:
            score += POINTS_VEGETATION_FUEL
            reasons.append("High fuel load in dense vegetation / forest cover")
        elif is_crop == 1:
            score += POINTS_CROPLAND_FUEL
            reasons.append("Agricultural cropland area (rapid spread risk)")

        road_dist = float(f.get("nearest_road_distance_m", 5000.0))
        is_road_adj = int(f.get("is_road_adjacent", 0))

        if is_road_adj == 1 or road_dist <= ROAD_ADJACENT_DIST_M:
            score += POINTS_ROAD_ADJACENT
            reasons.append(
                f"Directly adjacent to road network ({road_dist:.0f}m from road)"
            )

        return min(25.0, score), reasons

    def _evaluate_mitigation(
        self, f: Dict[str, Any]
    ) -> Tuple[float, List[str]]:
        water_dist = float(f.get("nearest_water_distance_m", 5000.0))
        water_count = int(f.get("water_body_count", 0))

        if water_count > 0 or water_dist <= WATER_BARRIER_DIST_M:
            return (
                POINTS_WATER_DEDUCTION,
                [f"Natural water body nearby ({water_dist:.0f}m) acts as fire barrier"],
            )

        return 0.0, []

    def _evaluate_population_exposure(
        self, f: Dict[str, Any]
    ) -> Tuple[float, List[str]]:
        score = 0.0
        reasons = []

        pop_density = float(f.get("population_density", 0.0))
        if pop_density >= POPULATION_HIGH_THRESHOLD:
            score += POINTS_HIGH_POPULATION
            reasons.append(f"High population density ({pop_density:.0f} people/pixel)")

        return min(15.0, score), reasons

    def _evaluate_powerplant_hazard(
        self, f: Dict[str, Any]
    ) -> Tuple[float, List[str]]:
        score = 0.0
        reasons = []

        pp_dist = float(f.get("nearest_powerplant_distance_m", DEFAULT_MAX_DISTANCE_M))
        if pp_dist <= POWERPLANT_CRITICAL_DIST_M:
            score += POINTS_POWERPLANT_CRITICAL
            reasons.append(f"Power plant within {pp_dist:.0f}m")

        return min(15.0, score), reasons

    def _evaluate_frp_anomaly(
        self, f: Dict[str, Any]
    ) -> Tuple[float, List[str]]:
        score = 0.0
        reasons = []

        zscore = float(f.get("frp_zscore", 0.0))
        if zscore >= FRP_ZSCORE_HIGH:
            score += POINTS_FRP_ZSCORE_HIGH
            reasons.append(f"High FRP anomaly (z={zscore:.2f})")
        elif zscore >= FRP_ZSCORE_MODERATE:
            score += POINTS_FRP_ZSCORE_MODERATE
            reasons.append(f"Moderate FRP anomaly (z={zscore:.2f})")

        return min(20.0, score), reasons

    def _evaluate_cluster_density(
        self, f: Dict[str, Any]
    ) -> Tuple[float, List[str]]:
        score = 0.0
        reasons = []

        density = int(f.get("cluster_density", 0))
        if density >= CLUSTER_DENSITY_HIGH:
            score += POINTS_CLUSTER_HIGH
            reasons.append(f"Large event cluster ({density} nearby hotspots)")
        elif density >= CLUSTER_DENSITY_MODERATE:
            score += POINTS_CLUSTER_MODERATE
            reasons.append(f"Moderate event cluster ({density} nearby hotspots)")

        return min(20.0, score), reasons

    def evaluate(self, feature_vector: Dict[str, Any]) -> Dict[str, Any]:
        f_score, f_reasons = self._evaluate_fire_intensity(feature_vector)
        i_score, i_reasons = self._evaluate_industrial_hazard(feature_vector)
        v_score, v_reasons = self._evaluate_human_vulnerability(feature_vector)
        s_score, s_reasons = self._evaluate_fuel_and_spread(feature_vector)
        m_score, m_reasons = self._evaluate_mitigation(feature_vector)
        pop_score, pop_reasons = self._evaluate_population_exposure(feature_vector)
        pp_score, pp_reasons = self._evaluate_powerplant_hazard(feature_vector)
        z_score, z_reasons = self._evaluate_frp_anomaly(feature_vector)
        cluster_score, cluster_reasons = self._evaluate_cluster_density(feature_vector)

        raw_total = (f_score + i_score + v_score + s_score + m_score
                     + pop_score + pp_score + z_score + cluster_score)
        clamped_score = max(0.0, min(100.0, round(raw_total, 1)))

        if clamped_score <= RISK_LEVEL_LOW_MAX:
            level = "LOW"
        elif clamped_score <= RISK_LEVEL_MEDIUM_MAX:
            level = "MEDIUM"
        else:
            level = "HIGH"

        all_reasons = (f_reasons + i_reasons + v_reasons + s_reasons
                       + m_reasons + pop_reasons + pp_reasons + z_reasons + cluster_reasons)
        if not all_reasons:
            all_reasons = ["Baseline low-intensity event with no immediate nearby hazards."]

        return {
            "risk_score": clamped_score,
            "risk_level": level,
            "breakdown": {
                "fire_intensity": round(f_score, 1),
                "industrial_hazard": round(i_score, 1),
                "human_vulnerability": round(v_score, 1),
                "fuel_and_spread": round(s_score, 1),
                "mitigation_deduction": round(m_score, 1),
                "population_exposure": round(pop_score, 1),
                "powerplant_hazard": round(pp_score, 1),
                "frp_anomaly": round(z_score, 1),
                "cluster_density": round(cluster_score, 1),
            },
            "reasons": all_reasons,
        }

    def evaluate_batch(
        self, feature_vectors: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        return [self.evaluate(fv) for fv in feature_vectors]

    def evaluate_dataframe(self, df: pd.DataFrame) -> pd.DataFrame:
        records = df.to_dict(orient="records")
        results = self.evaluate_batch(records)

        result_df = df.copy()
        result_df["risk_score"] = [r["risk_score"] for r in results]
        result_df["risk_level"] = [r["risk_level"] for r in results]
        result_df["risk_reasons"] = ["; ".join(r["reasons"]) for r in results]

        return result_df