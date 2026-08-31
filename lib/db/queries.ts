/**
 * Query helper entry point.
 *
 * Selects the data layer once, at import time:
 *   - normal mode → Supabase/Postgres (lib/db/queries.supabase.ts)
 *   - demo mode   → in-memory fixtures (lib/db/mock/queries.ts)
 *
 * Every caller imports from here, so nothing else in the app needs to know
 * which one is live. Both modules export the same names with the same
 * signatures; the mock module is diffed against this one in CI-free fashion by
 * TypeScript itself — a drift in either direction fails the build.
 */

import { IS_MOCK } from "@/lib/mock/flag";
import * as supabaseImpl from "./queries.supabase";
import * as mockImpl from "./mock/queries";

// Input types are shared — the mock layer reuses these definitions.
export type {
  TripLegInput,
  FlightInput,
  AccommodationInput,
} from "./queries.supabase";

const impl: typeof supabaseImpl = IS_MOCK ? mockImpl : supabaseImpl;

export const appendChangeLogEntry = impl.appendChangeLogEntry;
export const createItineraryFromLLMOutput = impl.createItineraryFromLLMOutput;
export const createTrip = impl.createTrip;
export const createTripLegs = impl.createTripLegs;
export const deleteActivity = impl.deleteActivity;
export const deleteTrip = impl.deleteTrip;
export const getAccommodationsForTrip = impl.getAccommodationsForTrip;
export const getActivitiesForDay = impl.getActivitiesForDay;
export const getActivityById = impl.getActivityById;
export const getArchivedTripsForUser = impl.getArchivedTripsForUser;
export const getBookingForTrip = impl.getBookingForTrip;
export const getChangeLogForTrip = impl.getChangeLogForTrip;
export const getCollaboratorsForTrip = impl.getCollaboratorsForTrip;
export const getCommunityPostsForDestination = impl.getCommunityPostsForDestination;
export const getCurrentItinerary = impl.getCurrentItinerary;
export const getCurrentItineraryHydrated = impl.getCurrentItineraryHydrated;
export const getDayById = impl.getDayById;
export const getDaysForItinerary = impl.getDaysForItinerary;
export const getFlightsForTrip = impl.getFlightsForTrip;
export const getItinerariesForTrip = impl.getItinerariesForTrip;
export const getLegsForTrip = impl.getLegsForTrip;
export const getPreferenceProfile = impl.getPreferenceProfile;
export const getReviewsForTrip = impl.getReviewsForTrip;
export const getRevisionInstructions = impl.getRevisionInstructions;
export const getTripBrief = impl.getTripBrief;
export const getTripById = impl.getTripById;
export const getTripInviteByToken = impl.getTripInviteByToken;
export const getTripsForUser = impl.getTripsForUser;
export const learnPreferenceProfile = impl.learnPreferenceProfile;
export const moveActivityToDay = impl.moveActivityToDay;
export const replaceAccommodationsForTrip = impl.replaceAccommodationsForTrip;
export const replaceDayActivitiesFromLLM = impl.replaceDayActivitiesFromLLM;
export const replaceFlightsForTrip = impl.replaceFlightsForTrip;
export const setActivityStartTime = impl.setActivityStartTime;
export const setDayLocked = impl.setDayLocked;
export const setLegDestinationGuide = impl.setLegDestinationGuide;
export const setTripArchived = impl.setTripArchived;
export const setTripDestinationGuide = impl.setTripDestinationGuide;
export const updateActivityFields = impl.updateActivityFields;
export const updateActivityFromLLMOutput = impl.updateActivityFromLLMOutput;
export const upsertBooking = impl.upsertBooking;
export const upsertPreferenceProfile = impl.upsertPreferenceProfile;
export const upsertTripBrief = impl.upsertTripBrief;
