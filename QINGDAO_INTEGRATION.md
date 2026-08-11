# Qingdao travel commerce integration

## Current scope

- `/qingdao`: platform home and customer journey
- `/qingdao/travel`: travel information and products (real products are not yet registered)
- `/qingdao/planner`: itinerary planner preview
- `/qingdao/guide`: destination guide structure
- `/qingdao/store`: the existing operational reward mall storefront
- `/qingdao/rewards`: the existing member reward balance and earning actions
- `/qingdao/my`: the existing order and review activity plus saved-trip preview

## Architecture decision

The Qingdao experience is implemented as a new customer-facing section of the
Reward Point Mall V2 application. It reads the same member session, catalog,
cart, order, review, attendance, and reward-point data. No database schema or
reward policy was changed in this phase.

## Next approval boundary

Before live publication, an administrator must register real travel products
and decide their prices, inventory/booking rules, completion criteria, and
reward amounts. Publishing the feature branch also requires explicit approval.
