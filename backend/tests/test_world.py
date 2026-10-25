def test_world_builds(world):
    assert world.trip["trip_id"].startswith("PT-")
    assert world.assignment["vehicle_id"] == world.truck["truck_id"]
