export interface Ride {
  id: string;
  driver_id: string;
  from_label: string;
  from_lat: number;
  from_lng: number;
  to_label: string;
  to_lat: number;
  to_lng: number;
  departure_at: string; // ISO 8601
  price_rub: number | null;
  seats_total: number;
  seats_taken: number;
  status: string;
  comment: string | null;
  created_at: string;
}
