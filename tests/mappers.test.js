// tests/mappers.test.js
import { gameToRow, gameFromRow } from '../js/database/mappers/gameMapper.js';
import { taskToRow, taskFromRow } from '../js/database/mappers/taskMapper.js';

test('gameToRow converte camelCase para snake_case e datas para ISO', () => {
    const date = new Date(2025, 0, 1, 12, 0);
    const game = {
        id: 5,
        description: 'Genshin Impact',
        abbreviation: 'GI',
        img: 'img.png',
        capStamina: '200',
        staminaPerMinute: '8',
        currentStamina: 50,
        maxStaminaAt: '01/01 12:00',
        dateMaxStamina: date,
        pendingTasks: 'algo',
        color: '#fff',
    };

    const row = gameToRow(game);

    expect(row.cap_stamina).toBe(200);
    expect(row.stamina_per_minute).toBe(8);
    expect(row.current_stamina).toBe(50);
    expect(row.date_max_stamina).toBe(date.toISOString());
    expect(row).not.toHaveProperty('id'); // id não vai no payload
});

test('gameFromRow reconstrói o objeto de domínio com dateMaxStamina como Date', () => {
    const iso = new Date(2025, 0, 1, 12, 0).toISOString();
    const game = gameFromRow({
        id: 3,
        description: 'HSR',
        cap_stamina: 300,
        stamina_per_minute: 6,
        current_stamina: 10,
        date_max_stamina: iso,
        pending_tasks: '',
        color: '#000',
    });

    expect(game.id).toBe(3);
    expect(game.capStamina).toBe(300);
    expect(game.dateMaxStamina).toBeInstanceOf(Date);
    expect(game.dateMaxStamina.toISOString()).toBe(iso);
});

test('taskToRow/taskFromRow são simétricos nos campos principais', () => {
    const date = new Date(2025, 2, 16, 6);
    const row = taskToRow({
        description: 'Spiral Abyss',
        expirationDate: date,
        isDone: true,
        refreshType: 6,
        gameId: 1,
        gameDescription: 'Genshin Impact',
    });

    expect(row.expiration_date).toBe(date.toISOString());
    expect(row.is_done).toBe(true);
    expect(row.game_id).toBe(1);

    const task = taskFromRow({ id: 9, ...row });
    expect(task.id).toBe(9);
    expect(task.expirationDate).toBeInstanceOf(Date);
    expect(task.isDone).toBe(true);
    expect(task.gameId).toBe(1);
});

test('taskFromRow mapeia o jogo relacionado embutido (embedding do Supabase)', () => {
    const task = taskFromRow({
        id: 1,
        description: 'Weekly Boss',
        expiration_date: new Date(2025, 2, 17, 6).toISOString(),
        is_done: false,
        refresh_type: 2,
        game_id: 3,
        game_description: 'Wuthering Waves',
        game: { id: 3, description: 'Wuthering Waves', color: '#ffffb3' },
    });

    expect(task.game).toBeDefined();
    expect(task.game.color).toBe('#ffffb3');
});
