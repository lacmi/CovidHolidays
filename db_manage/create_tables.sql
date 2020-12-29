create table if not exists posts(
    post_id integer primary key,
    post_time integer not null,
    post_author text not null,
    post_title text,
    post_text text,
    post_image_data blob,
    post_image_mimetype text,
    constraint image_needs_data_and_mimetype check((post_image_data is not null and post_image_mimetype is not null)
                                                   or
                                                   (post_image_data is null and post_image_mimetype is null)),
    constraint post_needs_text_or_image check(post_text is not null or (post_image_data is not null and post_image_mimetype is not null))
);

-- create table if not exists posts_text(
--     post_text_id integer primary key references posts(post_id) on update cascade on delete cascade,
--     post_text_title text,
--     post_text_body text not null 
-- );

-- create table if not exists posts_image(
--     post_image_id integer primary key references posts(post_id) on update cascade on delete cascade,
--     post_image_image blob not null
-- );