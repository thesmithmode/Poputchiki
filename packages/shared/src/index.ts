export { UserDTO, UserProfileInput } from "./schemas/user.js";
export type {
  UserDTO as UserDTOType,
  UserProfileInput as UserProfileInputType,
} from "./schemas/user.js";

export { CreateRideInput, MarkParticipantsInput, RideDTO, RideStatus } from "./schemas/ride.js";
export type {
  CreateRideInput as CreateRideInputType,
  MarkParticipantsInput as MarkParticipantsInputType,
  RideDTO as RideDTOType,
  RideStatus as RideStatusType,
} from "./schemas/ride.js";

export { LikeDTO } from "./schemas/like.js";
export type { LikeDTO as LikeDTOType } from "./schemas/like.js";

export { CreateReviewInput, ReviewDTO } from "./schemas/review.js";
export type {
  CreateReviewInput as CreateReviewInputType,
  ReviewDTO as ReviewDTOType,
} from "./schemas/review.js";

export { ComplaintInput } from "./schemas/complaint.js";
export type { ComplaintInput as ComplaintInputType } from "./schemas/complaint.js";

export { SupportMessageInput } from "./schemas/support-message.js";
export type { SupportMessageInput as SupportMessageInputType } from "./schemas/support-message.js";

export {
  NOTIFICATION_CATEGORIES,
  USER_TOGGLEABLE_CATEGORIES,
  isNotificationCategory,
  isUserToggleableCategory,
} from "./notifications/categories.js";
export type {
  NotificationCategory,
  UserToggleableCategory,
} from "./notifications/categories.js";
