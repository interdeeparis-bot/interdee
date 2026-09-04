-- Add product series/season support for the public catalogue.
alter table public.products add column if not exists season text not null default 'FW';
update public.products set season = case
  when id ~ '^(65|66)[0-9]{4}$' then '26FW'
  else coalesce(nullif(upper(season), ''), 'FW')
end;
update public.products set price = original, discount_rate = 0 where season = '26FW';
