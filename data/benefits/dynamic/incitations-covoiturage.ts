import { Institution } from "../../../data/types/institutions.d.js"
import { CoVoiturageBenefit } from "../../../data/types/benefits"
import { capitalize, uncapitalize } from "../../../lib/utils.js"
import benefitsJSON from "./incitations-covoiturage.json" assert { type: "json" }

export function buildIncitationsCovoiturage(
  institutions: Institution[]
): CoVoiturageBenefit[] {
  try {
    benefits.forEach(
      (b) =>
        (b.institution = institutions.find(
          (i) => i.code_siren === b.code_siren
        ))
    )

    return benefits
      .filter((b) => b.institution)
      .map((b) => {
        const institution = b.institution
        const prefixFormat = institution?.prefix
          ? institution?.prefix + (institution.prefix === "d'" ? "" : " ")
          : ""

        const prefixSansDe =
          (institution?.type === "departement" && !institution.prefix
            ? "le "
            : "") + prefixFormat.replace("de ", "").replace("d'", "")

        const prefixTitle =
          institution?.type === "departement" && !institution?.prefix
            ? "du "
            : prefixFormat

        let gainConducteur = ` Vous êtes conductrice ou conducteur ? `
        if (b.conducteur_montant_max_par_mois) {
          if (
            b.conducteur_montant_min_par_passager !==
            b.conducteur_montant_max_par_passager
          ) {
            gainConducteur += `Vous êtes indemnisé entre ${b.conducteur_montant_min_par_passager}€ et ${b.conducteur_montant_max_par_passager}€ par trajet et par passager, selon la distance parcourue, dans la limite de ${b.conducteur_montant_max_par_mois} € de gain par mois. `
          } else {
            gainConducteur += `Vous êtes indemnisé entre ${b.conducteur_montant_min_par_passager}€ et ${b.conducteur_montant_max_par_passager}€ par trajet et par passager, selon la distance parcourue. `
          }
        } else if (
          b.conducteur_montant_min_par_passager ===
          b.conducteur_montant_max_par_passager
        ) {
          gainConducteur += `Vous êtes indemnisé ${b.conducteur_montant_min_par_passager}€ par trajet et par passager, selon la distance parcourue. `
        } else {
          gainConducteur = ""
        }

        const institutionLabel =
          institution?.type === "departement"
            ? uncapitalize(institution?.label)
            : institution?.label

        const operateur =
          (!b.nom_plateforme
            ? ` ` + b.operateurs
            : b.nom_plateforme + ` , opérée par ` + b.operateurs) + `.`

        return {
          label: `Incitation au covoiturage ${prefixTitle}${institutionLabel}`,
          type: "bool",
          description:
            `${capitalize(prefixSansDe)}${institutionLabel}
          subventionne tous vos trajets réservés depuis l’application ` +
            operateur +
            gainConducteur +
            `Vous êtes passagère ou passager ? Bénéficiez de ${
              b.passager_trajets_max_par_mois / 30
            } trajets gratuits par jour.`,
          id: `${institution?.slug.replace(
            /_/g,
            "-"
          )}-incitations-covoiturage-eligibilite`,
          conditions: [
            `Télécharger l'application mobile ${operateur}`,
            `Réaliser votre trajet au départ ${b.zone_sens_des_trajets} à l’arrivée ${prefixTitle}${institutionLabel}.`,
            `Effectuer un trajet dont la distance est comprise entre ${b.trajet_longueur_min} et ${b.trajet_longueur_max} kilomètres.`,
          ],
          institution: institution?.slug,
          prefix: "l'",
          periodicite: "ponctuelle",
          link: b.link,
          source: "javascript",
          conditions_generales: [
            {
              type: "attached_to_institution",
            },
          ],
        }
      })
  } catch (error: any) {
    console.error(
      "Erreur lors de la construction des incitations co-voiturage",
      error.message
    )
  }
}

const benefits: {
  code_siren: string
  link: string
  nom_plateforme: string
  operateurs: string
  institution?: Institution
  zone_sens_des_trajets: string
  conducteur_montant_max_par_mois?: number
  conducteur_montant_min_par_passager?: number
  conducteur_montant_max_par_passager?: number
  trajet_longueur_min: number
  trajet_longueur_max: number
  passager_trajets_max_par_mois: number
}[] = benefitsJSON
