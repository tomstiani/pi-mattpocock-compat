# Seat Booking

Seat booking distinguishes temporary seat holds from confirmed bookings and names their endings explicitly.

## Language

**Hold**:
A temporary, exclusive claim on a seat for ten minutes from when it is granted, without extension from user activity. It ends through expiration, cancellation, or confirmation.
_Avoid_: Reservation, confirmed booking

**Reservation**:
A confirmed seat booking that replaces a Hold upon confirmation strictly before its deadline. It never silently expires and is unaffected by the former Hold’s deadline.
_Avoid_: Hold, temporary booking

**Expiration**:
The automatic end of a Hold at its ten-minute deadline, releasing the seat. A Hold at or beyond that deadline cannot be confirmed or cancelled.
_Avoid_: Cancellation

**Cancellation**:
An explicit user decision to end a Hold before expiration or to end a Reservation, releasing the seat.
_Avoid_: Expiration, automatic cancellation

**Confirmation**:
The successful decision that replaces an active Hold with a Reservation, preserving the claim on the seat. Confirmation and Hold cancellation are mutually exclusive endings; only the first successful decision takes effect.
_Avoid_: Hold, renewal
