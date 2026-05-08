import { useTelegramHaptic } from "../hooks/useTelegramHaptic";
import type { Ride } from "../types/ride";

interface RideCardProps {
  ride: Ride;
  onClick?: (ride: Ride) => void;
  isFavorited?: boolean;
  onToggleFavorite?: () => void;
}

export function RideCard({ ride, onClick, isFavorited, onToggleFavorite }: RideCardProps) {
  const { selection } = useTelegramHaptic();
  const time = new Date(ride.departure_at).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const seats = ride.seats_total - ride.seats_taken;

  return (
    <button
      type="button"
      onClick={() => onClick?.(ride)}
      className="w-full text-left bg-white rounded-xl shadow-sm border border-gray-100 p-4 cursor-pointer active:scale-[0.98] transition-transform"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-sm">
            <span className="font-medium text-gray-900 truncate">{ride.from_label}</span>
            <span className="text-gray-400 shrink-0">→</span>
            <span className="font-medium text-gray-900 truncate">{ride.to_label}</span>
          </div>
          <div className="mt-2 flex items-center gap-3 text-sm text-gray-500">
            <span>{time}</span>
            <span>·</span>
            <span>{seats} мест</span>
            <span>·</span>
            <span className="font-semibold text-gray-800">
              {ride.price_rub !== null ? `${ride.price_rub} ₽` : "Бесплатно"}
            </span>
          </div>
          {ride.comment !== null && (
            <div className="mt-2 text-sm text-gray-500 italic">{ride.comment}</div>
          )}
        </div>
        {onToggleFavorite && (
          <button
            type="button"
            data-testid="fav-toggle"
            onClick={(e) => {
              e.stopPropagation();
              selection();
              onToggleFavorite();
            }}
            aria-label={isFavorited ? "Убрать из избранного" : "Добавить в избранное"}
            className="shrink-0 p-1 text-xl leading-none"
          >
            {isFavorited ? "❤️" : "🤍"}
          </button>
        )}
      </div>
    </button>
  );
}
