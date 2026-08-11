INSERT OR IGNORE INTO members
  (email, name, role, status, points, charge_points, reward_points, pending_reward_points,
   email_verified, phone_verified, phone, joined_at)
VALUES
  ('sample01', '슈즈 라이브 운영자', 'member', 'active', 0, 0, 0, 0, 1, 0, '', CURRENT_TIMESTAMP),
  ('sample02', '스타일 라운지 운영자', 'member', 'active', 0, 0, 0, 0, 1, 0, '', CURRENT_TIMESTAMP),
  ('sample03', '라이프 픽 운영자', 'member', 'active', 0, 0, 0, 0, 1, 0, '', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO member_credentials
  (member_id, password_hash, failed_attempts, locked_until, updated_at)
SELECT id, 'pbkdf2-sha256$100000$CKm1FZ/AJDYYr+RnobSd9A==$8IHr9ZsLx8ZOCTwrF6TgGO5qAGJs5Y43orAKQnXQ6M8=', 0, NULL, CURRENT_TIMESTAMP
FROM members
WHERE email IN ('sample01', 'sample02', 'sample03');

UPDATE sales_channels
SET owner_member_id = NULL
WHERE owner_member_id IN (SELECT id FROM members WHERE email IN ('sample01', 'sample02', 'sample03'));

UPDATE sales_channels
SET owner_member_id = (SELECT id FROM members WHERE email = 'sample01'),
    application_status = 'published', approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP),
    published_at = COALESCE(published_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
WHERE slug = 'preview-shoes';

UPDATE sales_channels
SET owner_member_id = (SELECT id FROM members WHERE email = 'sample02'),
    application_status = 'published', approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP),
    published_at = COALESCE(published_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
WHERE slug = 'preview-style';

UPDATE sales_channels
SET owner_member_id = (SELECT id FROM members WHERE email = 'sample03'),
    application_status = 'published', approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP),
    published_at = COALESCE(published_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
WHERE slug = 'preview-life';
