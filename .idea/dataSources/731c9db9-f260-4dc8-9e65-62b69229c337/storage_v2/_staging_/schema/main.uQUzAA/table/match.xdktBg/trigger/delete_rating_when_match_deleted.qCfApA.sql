CREATE TRIGGER delete_rating_when_match_deleted
    AFTER DELETE
    ON match
BEGIN
    DELETE FROM rating WHERE match_id = old.id;
END;
