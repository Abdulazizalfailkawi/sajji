-- Community posts can be public (shown in المجتمع) or private (only on the owner's
-- profile grid). Additive: a new column with a default, replaced read functions
-- that keep their signatures, and one new function for "my posts". No data is
-- touched; every existing post stays public.

alter table public.community_posts
  add column if not exists visibility text not null default 'public' check (visibility in ('public', 'private'));

-- a private post can't be commented on by anyone but its owner
create or replace function public.community_post_open(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.community_posts
    where id = p_id and not is_hidden and (visibility = 'public' or user_id = (select auth.uid()))
  );
$$;

-- the feed only ever contains public posts
create or replace function public.community_feed(p_before timestamptz default now(), p_limit int default 20)
returns table (
  id uuid, user_id uuid, author text, body text, species_name text, weight_kg numeric, place_label text,
  photo_path text, thumb_path text, created_at timestamptz, likes bigint, comments bigint, liked boolean, mine boolean
)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  return query
    select p.id, p.user_id,
           coalesce(nullif(btrim(pr.display_name), ''), 'صياد ' || upper(left(md5(p.user_id::text), 4))) as author,
           p.body, p.species_name, p.weight_kg, p.place_label, p.photo_path, p.thumb_path, p.created_at,
           (select count(*) from public.community_likes l where l.post_id = p.id),
           (select count(*) from public.community_comments c where c.post_id = p.id and not c.is_hidden),
           exists (select 1 from public.community_likes l where l.post_id = p.id and l.user_id = auth.uid()),
           p.user_id = auth.uid()
    from public.community_posts p
    left join public.profiles pr on pr.id = p.user_id
    where not p.is_hidden and p.visibility = 'public' and p.created_at < p_before
    order by p.created_at desc
    limit least(greatest(p_limit, 1), 50);
end $$;

create or replace function public.community_comments(p_post uuid)
returns table (id uuid, user_id uuid, author text, body text, created_at timestamptz, mine boolean)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  return query
    select c.id, c.user_id,
           coalesce(nullif(btrim(pr.display_name), ''), 'صياد ' || upper(left(md5(c.user_id::text), 4))),
           c.body, c.created_at, c.user_id = auth.uid()
    from public.community_comments c
    join public.community_posts p on p.id = c.post_id and not p.is_hidden and (p.visibility = 'public' or p.user_id = auth.uid())
    left join public.profiles pr on pr.id = c.user_id
    where c.post_id = p_post and not c.is_hidden
    order by c.created_at
    limit 200;
end $$;

-- my own posts (public and private) for the profile grid
create or replace function public.community_my_posts(p_limit int default 60)
returns table (
  id uuid, user_id uuid, author text, body text, species_name text, weight_kg numeric, place_label text,
  photo_path text, thumb_path text, created_at timestamptz, likes bigint, comments bigint, liked boolean, mine boolean,
  visibility text
)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  return query
    select p.id, p.user_id,
           coalesce(nullif(btrim(pr.display_name), ''), 'صياد ' || upper(left(md5(p.user_id::text), 4))) as author,
           p.body, p.species_name, p.weight_kg, p.place_label, p.photo_path, p.thumb_path, p.created_at,
           (select count(*) from public.community_likes l where l.post_id = p.id),
           (select count(*) from public.community_comments c where c.post_id = p.id and not c.is_hidden),
           exists (select 1 from public.community_likes l where l.post_id = p.id and l.user_id = auth.uid()),
           true,
           p.visibility
    from public.community_posts p
    left join public.profiles pr on pr.id = p.user_id
    where p.user_id = auth.uid() and not p.is_hidden
    order by p.created_at desc
    limit least(greatest(p_limit, 1), 200);
end $$;

revoke all on function public.community_my_posts(int) from public, anon;
grant execute on function public.community_my_posts(int) to authenticated;
