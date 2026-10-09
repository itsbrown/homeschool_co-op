# Parent concierge guardrails

These bind the chat in [ADR-001.md](./ADR-001.md). The unmounted Anthropic router in `server/api/parent-concierge.ts` does not follow them. Do not mount that router to satisfy the ADR.

## A parent sees only their own family

- Resolve the parent from `req.user.id` after `supabaseAuth`. Never from a tool argument, prompt text, or `user_metadata`.
- Children: `children.parent_id = req.user.id` **or** `child_guardians.guardian_user_id = req.user.id`.
- Enrollments, week plans, and RSVPs: only those `child_id`s. If a tool argument names some other child, ignore it and return the signed-in family, or refuse.
- School staff data, other parents' emails, and other families' RSVP names are out of the tool results.
- Integer ids only. The Supabase UUID is not `parent_id`.

## No payments and no Stripe

The concierge does not read or write:

- `stripe_customer_id`, payment methods, PaymentIntents, Checkout Sessions
- `program_enrollments` balances, `scheduled_payments`, credits, cart lines
- `users.auto_pay_enabled`

`rsvp_event` may record a **$0** store-event RSVP for the signed-in parent. If any attendee price is above 0, the tool does not start checkout. It returns a handoff.

## Sensitive actions go to a human

These are not tool side effects:

- Creating or changing an enrollment (`program_enrollments`, waitlist promotion, withdrawal)
- Registering a child
- Changing allergies, medical info, emergency contacts, or custody
- Paying, refunding, or turning on autopay
- RSVPing another family, or overriding a cap

`start_enrollment_inquiry` sends Corey an email through SendGrid and tells the parent a person will follow up. It does not enroll anyone.

The assistant's prose is not an approval, a placement, or a receipt.

## No marketing profiles of children

- Do not write child name, birthdate, gender, grade, Lexile, or interests to `marketing_links`, `link_analytics`, Brevo contacts, or the engagement demographic slices.
- Chat analytics (`concierge_turn`, `concierge_tool`) store the parent `user_id`, school, tool name, and success. They do not store a child segment.
- Age band is a mask for dev data. It is not a marketing attribute collected by the chat.
- Do not put medical text, exact birthdates, or calendar feed tokens into the model prompt "for context."

## Dev data

Use a masked dev database ([masking.md](./masking.md)) when building tools. Do not point a concierge experiment at production, and do not run `db:push` to get there.
