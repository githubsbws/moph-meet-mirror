# Patient fields and Telemedicine calendar

## Delivered

- In the create-exam-room form, patient name and 13-digit citizen ID are visibly marked required when inviting a patient at room creation.
- Inviting at room creation requires both values; creating the room first and inviting later remains available by leaving both fields empty.
- CID validation follows the stated requirement: numeric input of exactly 13 digits. It no longer adds an undisclosed checksum requirement.
- The web and mobile calendars mark only `exam` rooms (Telemedicine appointments) returned by MOPH Meet.
- The web calendar no longer fetches, displays, or filters by external public holidays. The existing holiday API is retained but is not used by the calendar.
