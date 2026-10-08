import { CalendarController } from './calendar.controller';

describe('CalendarController (wiring only — see calendar.permissions.spec.ts for guard/route-metadata coverage)', () => {
  const companyId = 'company-1';
  const userId = 'user-1';

  function buildController() {
    const calendarService = {
      create: jest.fn().mockResolvedValue({ id: 'event-1' }),
      findAll: jest.fn().mockResolvedValue({ data: [], meta: {} }),
      findById: jest.fn().mockResolvedValue({ id: 'event-1' }),
      update: jest.fn().mockResolvedValue({ id: 'event-1' }),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const controller = new CalendarController(calendarService as never);
    const req = { user: { sub: userId, companyId } } as never;

    return { controller, calendarService, req };
  }

  it('create() delegates to CalendarService.create with companyId, the actor id, and the body', async () => {
    const { controller, calendarService, req } = buildController();
    const dto = { title: 'X', startAt: 'a', endAt: 'b' } as never;

    await controller.create(req, dto);

    expect(calendarService.create).toHaveBeenCalledWith(companyId, userId, dto);
  });

  it('findAll() delegates with companyId and the query', async () => {
    const { controller, calendarService, req } = buildController();
    const query = { from: 'a', to: 'b' } as never;

    await controller.findAll(req, query);

    expect(calendarService.findAll).toHaveBeenCalledWith(companyId, query);
  });

  it('findById() delegates with companyId and the id param', async () => {
    const { controller, calendarService, req } = buildController();

    await controller.findById(req, 'event-1');

    expect(calendarService.findById).toHaveBeenCalledWith(companyId, 'event-1');
  });

  it('update() delegates with companyId, id, body, and the actor id — in that order', async () => {
    const { controller, calendarService, req } = buildController();
    const dto = { title: 'Renamed' } as never;

    await controller.update(req, 'event-1', dto);

    expect(calendarService.update).toHaveBeenCalledWith(
      companyId,
      'event-1',
      dto,
      userId,
    );
  });

  it('remove() delegates with companyId, id, and the actor id', async () => {
    const { controller, calendarService, req } = buildController();

    await controller.remove(req, 'event-1');

    expect(calendarService.remove).toHaveBeenCalledWith(
      companyId,
      'event-1',
      userId,
    );
  });
});
