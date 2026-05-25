CREATE INDEX user_names ON user (lastname, firstname, patronymic);
CREATE INDEX city_lower_name ON city (lower(name));