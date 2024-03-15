import { Response, NextFunction } from "express"
import Sentry from "@sentry/node"

import Followups from "../models/followup.js"
import { Followup } from "../../lib/types/followup.d.js"
import Benefits from "../../data/all.js"
import pollResult from "../lib/mattermost-bot/poll-result.js"
import simulationController from "./simulation.js"
import { SurveyType } from "../../lib/enums/survey.js"
import { FollowupFactory } from "../lib/followup-factory.js"
import { FetchSurvey } from "../../lib/types/survey.d.js"
import Request from "../types/express.d.js"
import { phoneNumberValidation } from "../../lib/phone-number.js"
import config from "../config/index.js"
import { sendSimulationResultsEmail } from "../lib/messaging/email/email-service.js"
import { sendSimulationResultsSms } from "../lib/messaging/sms/sms-service.js"
import dayjs from "dayjs"

export function followup(
  req: Request,
  res: Response,
  next: NextFunction,
  id: string
) {
  Followups.findById(id)
    .populate("simulation")
    .exec(function (err: any, followup: Followup | null) {
      if (err) {
        return next(err)
      }
      // no matching followup or wrong or missing access token
      if (
        !followup?.accessToken ||
        followup.accessToken !== req?.query?.token
      ) {
        return res.redirect("/")
      }
      req.followup = followup
      simulationController.simulation(req, res, next, followup.simulation)
    })
}

export function resultRedirect(req: Request, res: Response) {
  simulationController.attachAccessCookie(req, res)
  res.redirect(req.simulation!.returnPath)
}

export function recapRedirect(req: Request, res: Response) {
  simulationController.attachAccessCookie(req, res)
  res.redirect(`/simulation/recapitulatif?simulationId=${req.simulation._id}`)
}

export async function persist(req: Request, res: Response) {
  const { preventNotify, surveyOptin, email, phone } = req.body

  if (!preventNotify && !email?.length && !phone?.length) {
    return res.status(400).send({ result: "Missing Email or Phone" })
  }

  const simulation = req.simulation

  try {
    const followup = (await FollowupFactory.create(
      simulation,
      surveyOptin,
      email,
      phone
    )) as Followup
    if (email) {
      await sendSimulationResultsEmail(followup)
    }
    if (phone) {
      if (
        phoneNumberValidation(
          phone,
          config.smsService.internationalDiallingCodes
        )
      ) {
        await sendSimulationResultsSms(followup)
      } else {
        return res.status(422).send("Unsupported phone number format")
      }
    }
    if (preventNotify) {
      const simulationRecapUrl = `${process.env.MES_AIDES_ROOT_URL}/followups/recap/${followup._id}?token=${followup.accessToken}`
      res.send({ simulationRecapUrl })
    } else {
      res.send({ result: "OK" })
    }
  } catch (error: any) {
    Sentry.captureException(error)
    if (error.name === "ValidationError") {
      return res.status(403).send(error.message)
    } else {
      return res.status(500).send(`Error while persisting followup`)
    }
  }
}

export function getFollowupDataForSurvey(req: Request, res: Response) {
  const usefullnessSurvey = req.followup.surveys.find(
    (survey) => survey.type === SurveyType.TrackClickOnSimulationUsefulnessEmail
  )

  const simulationWasUseful =
    usefullnessSurvey?.answers.find((answer) => answer.id === "wasUseful")
      ?.value ?? true // La simulation est utile par défaut

  res.send({
    createdAt: req.followup.createdAt,
    benefits: req.followup.benefits.filter(
      (benefit) => benefit.id in Benefits.benefitsMap
    ),
    simulationWasUseful,
  } as FetchSurvey)
}

export function showFollowup(req: Request, res: Response) {
  Followups.findById(req.params.surveyId)
    .then((followup: Followup | null) => {
      if (!followup) return res.sendStatus(404)
      res.send([followup])
    })
    .catch((error: Error) => {
      console.error("error", error)
      return res.sendStatus(400)
    })
}

export function showSurveyResults(req: Request, res: Response) {
  Followups.find({
    surveyOptin: true,
    surveys: {
      $elemMatch: {
        repliedAt: { $exists: true },
        type: SurveyType.BenefitAction,
      },
    },
  })
    .skip(0)
    .limit(10)
    .sort({ "surveys.repliedAt": -1 })
    .then((followup: Followup[]) => {
      res.send(followup)
    })
}

export function showSurveyResultByEmail(req: Request, res: Response) {
  Followups.findByEmail(req.params.email)
    .then((followups: Followup[]) => {
      if (!followups || !followups.length) return res.sendStatus(404)
      res.send(followups)
    })
    .catch((error: Error) => {
      console.error("error", error)
      return res.sendStatus(400)
    })
}

export async function followupByAccessToken(
  req: Request,
  res: Response,
  next: NextFunction,
  accessToken: any
) {
  const followup: Followup | null = await Followups.findOne({
    accessToken,
  })
  if (!followup) return res.sendStatus(404)
  req.followup = followup
  next()
}

export function postSurvey(req: Request, res: Response) {
  req.followup.updateSurvey(SurveyType.BenefitAction, req.body).then(() => {
    res.sendStatus(201)
  })
  pollResult.postPollResult(req.followup, req.body)
}

export async function updateWasUseful(req: Request) {
  const answers = [
    {
      id: "wasUseful",
      value: req.query.wasuseful !== undefined,
    },
  ]
  const { followup } = req
  await followup.updateSurvey(
    SurveyType.TrackClickOnSimulationUsefulnessEmail,
    answers
  )
  await followup.save()
}

async function updateTrackClickOnBenefitActionEmail(req: Request) {
  const { followup } = req
  await followup.updateSurvey(SurveyType.TrackClickOnBenefitActionEmail)
}

async function updateSurveyInFollowup(req: Request) {
  const { surveyType } = req.params
  const { followup } = req

  switch (surveyType) {
    case SurveyType.TrackClickOnSimulationUsefulnessEmail:
      await updateWasUseful(req)
      break
    case SurveyType.TrackClickOnBenefitActionEmail:
      await updateTrackClickOnBenefitActionEmail(req)
      break
    case SurveyType.TousABordNotification:
      await followup.updateSurvey(SurveyType.TousABordNotification)
      break
    default:
      throw new Error(`Unknown survey type: ${surveyType}`)
  }
}

async function getRedirectUrl(req: Request) {
  const { surveyType } = req.params
  const { followup } = req
  switch (surveyType) {
    case SurveyType.TrackClickOnSimulationUsefulnessEmail:
    case SurveyType.TrackClickOnBenefitActionEmail:
    case SurveyType.TrackClickOnBenefitActionSms: {
      await followup.addSurveyIfMissing(SurveyType.BenefitAction)
      const surveyOpened = await followup.addSurveyIfMissing(surveyType)
      surveyOpened.openedAt = dayjs().toDate()
      await followup.save()
      return followup.surveyPath
    }
    case SurveyType.TousABordNotification:
      return "https://www.tadao.fr/713-Demandeur-d-emploi.html"
    default:
      throw new Error(`Unknown survey type: ${surveyType}`)
  }
}

export async function logSurveyLinkClick(req: Request, res: Response) {
  try {
    await updateSurveyInFollowup(req)
    const redirectUrl = await getRedirectUrl(req)

    res.redirect(redirectUrl)
  } catch (error) {
    console.error("error", error)
    return res.sendStatus(404)
  }
}

export async function smsSurveyLinkClick(req: Request, res: Response) {
  try {
    req.params.surveyType = SurveyType.TrackClickOnBenefitActionSms
    const redirectUrl = await getRedirectUrl(req)
    res.redirect(redirectUrl)
  } catch (error) {
    console.error("error", error)
    return res.sendStatus(404)
  }
}
