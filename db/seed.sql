-- db/seed.sql
-- Dados iniciais (jogos) do Gacha Management.
-- Rode DEPOIS de db/schema.sql, no SQL Editor do Supabase.
-- Idempotente: só insere se a tabela `games` estiver vazia (mantém ids 1..4).

insert into public.games (description, abbreviation, img, cap_stamina, stamina_per_minute, color)
select v.description, v.abbreviation, v.img, v.cap_stamina, v.stamina_per_minute, v.color
from (values
    ('Genshin Impact',    'GI',   'img/genshin-icon.png',          200, 8, '#b3d9ff'),
    ('Honkai Star Rail',  'HSR',  'img/star-rail-icon.png',        300, 6, '#d1f0d1'),
    ('Wuthering Waves',   'WuWa', 'img/wuthering-waves-icon.png',  240, 6, '#ffffb3'),
    ('Zenless Zone Zero', 'ZZZ',  'img/zzz-icon.png',              240, 6, '#e6ccff')
) as v(description, abbreviation, img, cap_stamina, stamina_per_minute, color)
where not exists (select 1 from public.games);
